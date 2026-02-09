import type { RunContext } from "@server/world/providers/llm/context.js";
import { LLMService } from "@server/world/providers/llm/llm-service.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { BrainModule } from "./brain-module.js";
import type { BrainGoal } from "./types.js";
import { BRAIN_PARTS, getBrainPart } from "./brain-parts.js";
import { WorkingMemoryManager } from "./working-memory.js";
import { randomUUID } from "node:crypto";

export class System2 {
  constructor(
    private conversationManager: ConversationManager,
    private context: RunContext
  ) {}

  async run(): Promise<{ runId: string; response: string; tokensUsed?: number }> {
    const llmService = new LLMService(this.context.llmModel, this.context.streamEmitter, this.context.runId);
    let totalTokensUsed = 0;
    const maxCycles = 100; // Safety limit for infinite loop
    let cycles = 0;

    // Track history of brain part activations and results
    const executionHistory: Array<{
      brainPartId: string;
      brainPartName: string;
      goal: string;
      completed: boolean;
      result: string;
      toolCallsMade: number;
    }> = [];

    // Initialize working memory with user request
    const workingMemory = WorkingMemoryManager.initialize(this.context.relevantMemoriesText);
    const workingMemoryManager = new WorkingMemoryManager(workingMemory);
    // Add user request to working memory at the beginning
    workingMemoryManager.update({
      memories: [`User request: ${this.context.message}`, ...workingMemory.memories],
    });

    // Initialize with user's message as first goal
    const initialGoal: BrainGoal = {
      id: randomUUID(),
      description: this.context.message,
      brainPartId: "planning", // Start with planning
    };

    await this.conversationManager.addMessage(
      this.context.conversationId,
      "system",
      `[System2] Starting brain loop with initial goal: ${initialGoal.description}`,
      { runId: this.context.runId }
    );

    while (cycles < maxCycles) {
      cycles++;
      console.log(`[System2] Cycle ${cycles}`);

      // Self decides which brain part should work and with what goal
      const decision = await this.decideNextAction(llmService, workingMemoryManager, executionHistory);
      
      // Self decides what to remember from this cycle
      const memoryUpdate = await this.decideWhatToRemember(llmService, workingMemoryManager);
      if (memoryUpdate.memories.length > 0) {
        workingMemoryManager.update({ memories: memoryUpdate.memories });
        console.log(`[System2] Updated working memory with ${memoryUpdate.memories.length} memories`);
      }
      
      if (decision.shouldStop) {
        const finalResponse = decision.reason || "Task completed";
        await this.conversationManager.addMessage(
          this.context.conversationId,
          "assistant",
          finalResponse,
          { runId: this.context.runId }
        );
        
        await this.context.streamEmitter.emitLifecycleEnd(
          this.context.runId,
          totalTokensUsed,
          finalResponse
        );
        
        return {
          runId: this.context.runId,
          response: finalResponse,
          tokensUsed: totalTokensUsed,
        };
      }

      // Get the brain part
      const brainPart = getBrainPart(decision.brainPartId);
      if (!brainPart) {
        console.warn(`[System2] Unknown brain part: ${decision.brainPartId}, defaulting to planning`);
        continue;
      }

      // Create goal for brain part
      const goal: BrainGoal = {
        id: randomUUID(),
        description: decision.goal,
        brainPartId: decision.brainPartId,
      };

      console.log(`[System2] Activating ${brainPart.name} with goal: ${goal.description}`);

      // Format history text for brain part
      const historyText = executionHistory.length > 0
        ? (() => {
            const lastExec = executionHistory[executionHistory.length - 1];
            return `Last Brain Part Execution:\n${lastExec.brainPartName} (${lastExec.brainPartId})\nGoal: ${lastExec.goal}\nCompleted: ${lastExec.completed}\nResult: ${lastExec.result.substring(0, 300)}${lastExec.result.length > 300 ? '...' : ''}\nTool calls: ${lastExec.toolCallsMade}`;
          })()
        : "Last Brain Part Execution: (none yet)";

      // Run brain module with working memory
      const brainModule = new BrainModule(
        this.conversationManager,
        this.context,
        brainPart,
        goal,
        workingMemoryManager,
        historyText
      );

      console.log(`[System2] Running ${brainPart.name} (${brainPart.id})...`);
      const brainResult = await brainModule.run();
      
      // Accumulate tokens (if available)
      // Note: BrainModule doesn't return tokens, but we can track tool calls
      console.log(`[System2] ${brainPart.name} completed: ${brainResult.completed}, tool calls: ${brainResult.toolCallsMade}`);

      // Track this execution in history
      executionHistory.push({
        brainPartId: brainPart.id,
        brainPartName: brainPart.name,
        goal: goal.description,
        completed: brainResult.completed,
        result: brainResult.result,
        toolCallsMade: brainResult.toolCallsMade,
      });

      // Add result to conversation
      await this.conversationManager.addMessage(
        this.context.conversationId,
        "system",
        `[System2] ${brainPart.name} result: ${brainResult.result}`,
        { runId: this.context.runId }
      );
    }

    // Max cycles reached
    const timeoutResponse = "System2 reached maximum cycles. Task may be incomplete.";
    await this.conversationManager.addMessage(
      this.context.conversationId,
      "assistant",
      timeoutResponse,
      { runId: this.context.runId }
    );

    await this.context.streamEmitter.emitLifecycleEnd(
      this.context.runId,
      totalTokensUsed,
      timeoutResponse
    );

    return {
      runId: this.context.runId,
      response: timeoutResponse,
      tokensUsed: totalTokensUsed,
    };
  }

  private async decideNextAction(
    llmService: LLMService,
    workingMemoryManager: WorkingMemoryManager,
    executionHistory: Array<{
      brainPartId: string;
      brainPartName: string;
      goal: string;
      completed: boolean;
      result: string;
      toolCallsMade: number;
    }>
  ): Promise<{
    brainPartId: string;
    goal: string;
    shouldStop: boolean;
    reason?: string;
  }> {
    const workingMemory = workingMemoryManager.getState();
    const workingMemoryText = workingMemory.memories.length > 0
      ? `Working Memory:\n${workingMemory.memories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
      : "Working Memory: (empty)";

    const brainPartsList = BRAIN_PARTS.map(p => `- ${p.id}: ${p.name}`).join("\n");

    // Format last execution only
    const historyText = executionHistory.length > 0
      ? (() => {
          const lastExec = executionHistory[executionHistory.length - 1];
          return `Last Brain Part Execution:\n${lastExec.brainPartName} (${lastExec.brainPartId})\nGoal: ${lastExec.goal}\nCompleted: ${lastExec.completed}\nResult: ${lastExec.result.substring(0, 300)}${lastExec.result.length > 300 ? '...' : ''}\nTool calls: ${lastExec.toolCallsMade}`;
        })()
      : "Last Brain Part Execution: (none yet)";

    const decisionPrompt = `You are the Self - the central decision maker of System2, a brain part of Zuckerman - an autonomous AI agent that acts freely and independently to accomplish tasks.

CONTEXT: Zuckerman is an AI agent that operates completely independently. It has no human assistance and must rely entirely on its own capabilities, tools, and reasoning. As part of Zuckerman's brain, you coordinate the various brain modules (Planning, Execution, Research, Reflection, etc.) to help accomplish user requests autonomously.

Your role is to decide which brain part should work next and what goal it should pursue.

IMPORTANT: You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All decisions and actions must be made by you alone.

Available brain parts:
${brainPartsList}

${workingMemoryText}

${historyText}

Analyze the current state and decide:
1. Should we stop? (if the user's request is fully satisfied)
2. If not, which brain part should work next?
3. What specific goal should that brain part pursue?

Consider what has been done before and what still needs to be accomplished based on the execution history.

Guidance for brain part selection:
- Use "research" when you need to find solutions, alternatives, or information from online sources (Google, Stack Overflow, GitHub, documentation, etc.)
- Use "planning" when you need to break down complex goals into steps
- Use "execution" when you have a clear task to perform
- Use "reflection" when you need to analyze past actions and outcomes
- Use "criticism" when you need to evaluate work or plans
- Use "memory" when you need to store or retrieve information
- Use "creativity" when you need novel ideas or approaches
- Use "attention" when you need to focus on what's important
- Use "interaction" when you need to communicate with users or systems
- Use "error-handling" when you encounter errors or obstacles

Respond in JSON format:
{
  "shouldStop": true/false,
  "reason": "why stopping" (if shouldStop is true),
  "brainPartId": "id of brain part" (if shouldStop is false),
  "goal": "specific goal for the brain part" (if shouldStop is false)
}`;

    try {
      const result = await llmService.call({
        messages: [
          { role: "system", content: this.context.systemPrompt },
          { role: "user", content: decisionPrompt },
        ],
        temperature: 0.3,
        availableTools: [],
      });

      // Parse JSON response
      const content = result.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]);
        return {
          brainPartId: decision.brainPartId || "planning",
          goal: decision.goal || "Continue working on the task",
          shouldStop: decision.shouldStop === true,
          reason: decision.reason,
        };
      }

      // Fallback: check if response indicates stopping
      if (content.toLowerCase().includes("stop") || content.toLowerCase().includes("complete")) {
        return {
          brainPartId: "planning",
          goal: "Task complete",
          shouldStop: true,
          reason: content,
        };
      }

      // Default: continue with planning
      return {
        brainPartId: "planning",
        goal: "Continue working on the user's request",
        shouldStop: false,
      };
    } catch (error) {
      console.warn(`[System2] Decision making failed:`, error);
      // Default: continue with planning
      return {
        brainPartId: "planning",
        goal: "Continue working on the user's request",
        shouldStop: false,
      };
    }
  }

  private async decideWhatToRemember(
    llmService: LLMService,
    workingMemoryManager: WorkingMemoryManager
  ): Promise<{ memories: string[] }> {
    const currentMemory = workingMemoryManager.getState();
    const currentMemoryText = currentMemory.memories.length > 0
      ? `Current working memory:\n${currentMemory.memories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
      : "Current working memory: (empty)";

    const memoryPrompt = `You are the Self - the central decision maker of System2, a brain part of Zuckerman - an autonomous AI agent that acts freely and independently to accomplish tasks.

CONTEXT: Zuckerman is an AI agent that operates completely independently. It has no human assistance and must rely entirely on its own capabilities, tools, and reasoning. As part of Zuckerman's brain, you coordinate the various brain modules to help accomplish user requests autonomously.

Your role is to decide what important information should be remembered in working memory.

IMPORTANT: You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All decisions and actions must be made by you alone.

${currentMemoryText}

Analyze what key information, insights, facts, or context should be remembered for future cycles. Keep only the most important and relevant information. Update the working memory list.

Respond in JSON format with an array of memory strings:
{
  "memories": [
    "memory item 1",
    "memory item 2",
    ...
  ]
}

Keep memories concise and actionable. Maximum 10 items.`;

    try {
      const result = await llmService.call({
        messages: [
          { role: "system", content: this.context.systemPrompt },
          { role: "user", content: memoryPrompt },
        ],
        temperature: 0.2,
        availableTools: [],
      });

      // Parse JSON response
      const content = result.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]);
        return {
          memories: Array.isArray(decision.memories) ? decision.memories : [],
        };
      }

      // Fallback: return current memory
      return {
        memories: currentMemory.memories,
      };
    } catch (error) {
      console.warn(`[System2] Memory decision failed:`, error);
      // Fallback: return current memory
      return {
        memories: currentMemory.memories,
      };
    }
  }
}
