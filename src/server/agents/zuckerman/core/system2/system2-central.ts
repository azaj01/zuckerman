import type { RunContext } from "@server/world/providers/llm/context.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { ToolService } from "../../tools/index.js";
import { LLMService } from "@server/world/providers/llm/llm-service.js";
import { arbitrate } from "./arbitrator.js";
import { ActionHandler, type ActionContext } from "./actions.js";
import { WorkingMemoryManager } from "./working-memory.js";
import type { Proposal, Decision, WorkingMemory } from "./types.js";
import { Action } from "./types.js";
import {
  InteractionModule,
  MemoryModule,
  PlanningModule,
  AttentionModule,
  ReflectionModule,
  CriticismModule,
  CreativityModule,
} from "./module/index.js";
import { writeProposalsToFile } from "./debug.js";

const MAX_ITERATIONS = 20;

export class System2 {
  private memoryManager: WorkingMemoryManager;
  private modules: Array<{ name: string; module: { run: (input: { userMessage: string; state: string }) => Promise<Proposal | null> } }>;

  constructor(
    private conversationManager: ConversationManager,
    private context: RunContext
  ) {
    console.log(`[System2] Initializing for runId: ${this.context.runId}`);
    
    // Initialize working memory
    const memory = WorkingMemoryManager.initialize(this.context.relevantMemoriesText);
    this.memoryManager = new WorkingMemoryManager(memory);

    // Initialize modules
    this.modules = [
      { name: "interaction", module: new InteractionModule(this.context.llmModel, this.context.systemPrompt) },
      { name: "memory", module: new MemoryModule(this.context.llmModel, this.context.systemPrompt) },
      { name: "planning", module: new PlanningModule(this.context.llmModel, this.context.systemPrompt) },
      { name: "attention", module: new AttentionModule(this.context.llmModel, this.context.systemPrompt) },
      { name: "reflection", module: new ReflectionModule(this.context.llmModel, this.context.systemPrompt) },
      { name: "creativity", module: new CreativityModule(this.context.llmModel, this.context.systemPrompt) },
      { name: "criticism", module: new CriticismModule(this.context.llmModel, this.context.systemPrompt) },
    ];

    console.log(`[System2] Initialized with ${memory.goals.length} goals, ${memory.memories.length} memories`);
  }

  async run(): Promise<{ runId: string; response: string; tokensUsed?: number }> {
    console.log(`[System2] Starting run for message: "${this.context.message.substring(0, 100)}${this.context.message.length > 100 ? '...' : ''}"`);
    
    let iteration = 0;
    let lastMessageCount = 0;
    
    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`[System2] Iteration ${iteration}/${MAX_ITERATIONS}`);

      const conversation = this.conversationManager.getConversation(this.context.conversationId);
      const currentMessageCount = conversation?.messages.length || 0;
      
      // Get new messages since last iteration
      const newMessages = conversation?.messages.slice(lastMessageCount) || [];
      lastMessageCount = currentMessageCount;

      // Collect proposals - pass state directly
      const state = JSON.stringify(this.memoryManager.getState(), null, 2);
      const proposals = await this.collectProposals(this.context.message, state);
      console.log(`[System2] Collected ${proposals.length} proposals`);

      // Arbitrate - pass new messages so it can learn and create memories
      const decision = await arbitrate(
        proposals,
        this.memoryManager.getState(),
        this.context.llmModel,
        this.context.systemPrompt,
        newMessages
      );

      if (!decision) {
        console.warn("[System2] No decision from arbitrator, stopping");
        break;
      }

      console.log(`[System2] Decision: ${Array.isArray(decision.action) ? decision.action.join(', ') : decision.action}`);

      // Execute decision
      const shouldContinue = await this.executeDecision(decision);

      if (!shouldContinue) {
        console.log(`[System2] Decision execution completed, ending loop`);
        break;
      }

      // Update working memory
      this.memoryManager.update(decision.stateUpdates);
    }

    if (iteration >= MAX_ITERATIONS) {
      console.warn(`[System2] Reached max iterations (${MAX_ITERATIONS}), stopping`);
    }

    // Get final response
    const conversation = this.conversationManager.getConversation(this.context.conversationId);
    const lastMessage = conversation?.messages
      .filter(m => m.role === "assistant")
      .slice(-1)[0];

    const response = lastMessage?.content || "I apologize, but I couldn't generate a response.";
    console.log(`[System2] Run completed after ${iteration} iterations`);
    await this.context.streamEmitter.emitLifecycleEnd(this.context.runId, undefined, response);

    return {
      runId: this.context.runId,
      response,
    };
  }

  private async collectProposals(userMessage: string, stateSummary: string): Promise<Proposal[]> {
    const proposals: Proposal[] = [];

    // Run all modules in parallel, including criticism
    const results = await Promise.all(
      this.modules.map(m => m.module.run({ userMessage, state: stateSummary }))
    );

    for (const result of results) {
      if (result) proposals.push(result);
    }

    // Write proposals to file for inspection
    await writeProposalsToFile(proposals, userMessage, stateSummary, this.conversationManager, this.context);

    return proposals;
  }

  private async executeDecision(decision: Decision): Promise<boolean> {
    const llmService = new LLMService(this.context.llmModel, this.context.streamEmitter, this.context.runId);
    const toolService = new ToolService();

    const actionContext: ActionContext = {
      conversationManager: this.conversationManager,
      llmService,
      toolService,
      context: this.context,
      workingMemory: this.memoryManager.getState(),
    };
    const actionHandler = new ActionHandler(actionContext);

    const actions = Array.isArray(decision.action) ? decision.action : [decision.action];
    const payloads = Array.isArray(decision.payload) ? decision.payload : [decision.payload];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const payload = payloads[i] || payloads[0] || {};

      const result = await actionHandler.execute(action, payload);
      
      if (!result.shouldContinue) {
        return false;
      }
    }

    return true;
  }


}
