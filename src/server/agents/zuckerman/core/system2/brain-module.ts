import type { RunContext } from "@server/world/providers/llm/context.js";
import { LLMService } from "@server/world/providers/llm/llm-service.js";
import { ToolService } from "../../tools/index.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import type { BrainPart, BrainGoal } from "./types.js";
import { WorkingMemoryManager } from "./working-memory.js";

export interface BrainModuleResult {
  completed: boolean;
  result: string;
  toolCallsMade: number;
}

export class BrainModule {
  constructor(
    private conversationManager: ConversationManager,
    private context: RunContext,
    private brainPart: BrainPart,
    private goal: BrainGoal,
    private workingMemoryManager: WorkingMemoryManager
  ) {}

  async run(): Promise<BrainModuleResult> {
    const llmService = new LLMService(this.context.llmModel, this.context.streamEmitter, this.context.runId);
    const toolService = new ToolService();
    
    let toolCallsMade = 0;
    const maxIterations = 50; // Safety limit
    let iterations = 0;

    console.log(`[BrainModule] Starting ${this.brainPart.name} (${this.brainPart.id}) - Goal: ${this.goal.description}`);

    // Add initial goal message to conversation
    await this.conversationManager.addMessage(
      this.context.conversationId,
      "system",
      `[Brain Part: ${this.brainPart.name}] Goal: ${this.goal.description}`,
      { runId: this.context.runId }
    );

    while (iterations < maxIterations) {
      iterations++;
      console.log(`[BrainModule] ${this.brainPart.name} iteration ${iterations}/${maxIterations}`);
      
      const conversation = this.conversationManager.getConversation(this.context.conversationId);
      
      // Get current working memory
      const workingMemory = this.workingMemoryManager.getState();
      const workingMemoryText = workingMemory.memories.length > 0
        ? `\n\nWorking Memory (available context):\n${workingMemory.memories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
        : "\n\nWorking Memory: (empty)";
      
      // Build messages with brain part prompt + working memory as system prompt
      const enhancedPrompt = `${this.brainPart.prompt}${workingMemoryText}`;
      const messages = [
        { role: "system" as const, content: enhancedPrompt },
        ...llmService.buildMessages(this.context, conversation).slice(1) // Skip original system prompt
      ];

      const result = await llmService.call({
        messages,
        temperature: this.context.temperature,
        availableTools: this.context.availableTools,
      });

      // Check if goal is complete (no tool calls means brain part thinks it's done)
      if (!result.toolCalls?.length) {
        // Brain part indicates completion
        const completionMessage = result.content || `Goal "${this.goal.description}" completed by ${this.brainPart.name}`;
        
        console.log(`[BrainModule] ${this.brainPart.name} completed successfully after ${iterations} iterations`);
        
        await this.conversationManager.addMessage(
          this.context.conversationId,
          "assistant",
          completionMessage,
          { runId: this.context.runId }
        );

        return {
          completed: true,
          result: completionMessage,
          toolCallsMade,
        };
      }

      // Handle tool calls
      toolCallsMade += result.toolCalls.length;
      console.log(`[BrainModule] ${this.brainPart.name} making ${result.toolCalls.length} tool call(s): ${result.toolCalls.map(tc => tc.name).join(", ")}`);
      
      const toolCalls = result.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
      }));
      
      await this.conversationManager.addMessage(
        this.context.conversationId,
        "assistant",
        result.content || "",
        { toolCalls, runId: this.context.runId }
      );

      const toolResults = await toolService.executeTools(this.context, result.toolCalls);
      for (const toolResult of toolResults) {
        await this.conversationManager.addMessage(
          this.context.conversationId,
          "tool",
          toolResult.content,
          { toolCallId: toolResult.toolCallId, runId: this.context.runId }
        );
      }
    }

    // Max iterations reached
    console.log(`[BrainModule] ${this.brainPart.name} reached maximum iterations (${maxIterations})`);
    return {
      completed: false,
      result: `Brain module reached maximum iterations (${maxIterations})`,
      toolCallsMade,
    };
  }
}
