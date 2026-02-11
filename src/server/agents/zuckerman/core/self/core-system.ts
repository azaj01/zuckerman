import { streamText } from "ai";
import { randomUUID } from "node:crypto";
import type { Tool, LanguageModel } from "ai";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { IdentityLoader } from "../identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { UnifiedMemoryManager } from "../memory/manager.js";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter.js";
import { activityRecorder } from "@server/agents/zuckerman/activity/index.js";
import { System1BrainParts } from "./system1-brain-parts.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import type { AgentEvent } from "./events.js";

export class CoreSystem {
  constructor(
    private agentId: string,
    private emitEvent: (event: AgentEvent) => Promise<void>
  ) {}

  async run(
    runId: string,
    conversationId: string,
    message: string,
    conversationMessages: ConversationMessage[]
  ): Promise<{ 
    runId: string; 
    response: string; 
    tokensUsed?: number;
  }> {
    const {
      systemPrompt,
      llmModel,
      availableTools,
      memoryManager,
      temperature,
    } = await this.initialize(runId, conversationId, message);

    // Emit lifecycle start event
    await this.emitEvent({
      type: "stream.lifecycle",
      conversationId,
      runId,
      phase: "start",
      message,
    });

    let enrichedMessage = message;
    
    // Build context if needed (simple proactive gathering)
    const contextResult = await System1BrainParts.buildContext(
      runId,
      message,
      conversationId,
      llmModel,
      availableTools
    );
    enrichedMessage = contextResult.enrichedMessage;
    if (contextResult.messageToAdd && this.emitEvent) {
      await this.emitEvent({
        type: "write",
        conversationId,
        content: contextResult.messageToAdd.content,
        runId,
      });
    }

    // Get relevant memories
    let memoriesText = "";
    try {
      const memoryResult = await memoryManager.getRelevantMemories(message, {
        limit: 50,
        types: ["semantic", "episodic", "procedural"],
      });
      memoriesText = formatMemoriesForPrompt(memoryResult);
    } catch (error) {
      console.warn(`[CoreSystem] Memory retrieval failed:`, error);
    }

    const maxIterations = 50;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      // Build messages with system prompt, memories, and conversation
      const messagesWithSystem: ConversationMessage[] = [
        {
          role: "system",
          content: `${systemPrompt}\n\n${memoriesText}`.trim(),
          timestamp: Date.now(),
        },
        ...conversationMessages,
      ];

      // Ensure conversation ends with user message
      const nonSystemMessages = messagesWithSystem.filter((m) => m.role !== "system");
      if (
        nonSystemMessages.length > 0 &&
        nonSystemMessages[nonSystemMessages.length - 1].role === "assistant"
      ) {
        messagesWithSystem.push({
          role: "user",
          content: "Please continue.",
          timestamp: Date.now(),
        });
      }

      const messages = convertToModelMessages(messagesWithSystem);

      // Execute with streaming
      const streamResult = await streamText({
        model: llmModel,
        messages,
        temperature: temperature,
        tools: Object.keys(availableTools).length > 0 ? availableTools : undefined,
      });

      let content = "";
      for await (const chunk of streamResult.textStream) {
        content += chunk;
        await this.emitEvent({
          type: "stream.token",
          conversationId,
          runId,
          token: chunk,
        });
      }

      // Handle tool calls
      const toolCalls = await streamResult.toolCalls;
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const args =
            typeof toolCall.input === "object" && toolCall.input !== null
              ? (toolCall.input as Record<string, unknown>)
              : { value: toolCall.input };
          await this.emitEvent({
            type: "stream.tool.call",
            conversationId,
            runId,
            tool: toolCall.toolName,
            toolArgs: args,
          });
          await activityRecorder.recordToolCall(
            this.agentId,
            conversationId,
            runId,
            toolCall.toolName,
            args
          );
        }
      }

      const usage = await streamResult.usage;
      const result = { text: content };
      const tokensUsed = usage?.totalTokens;

      // Simple validation
      try {
        const validation = await System1BrainParts.validate(
          enrichedMessage,
          result.text,
          llmModel,
          availableTools
        );

        if (!validation.satisfied) {
          const missing = validation.missing.length
            ? ` Missing: ${validation.missing.join(", ")}.`
            : "";
          if (this.emitEvent) {
            await this.emitEvent({
              type: "think",
              conversationId,
              thought: `Validation: ${validation.reason}.${missing} Instructions: Try different approach to complete the task.`,
              runId
            });
          }
          continue;
        }
      } catch (error) {
        console.warn(`[CoreSystem] Validation error:`, error);
      }

      if (this.emitEvent) {
        await this.emitEvent({
          type: "speak",
          conversationId,
          message: result.text,
          runId
        });
      }

      await this.emitEvent({
        type: "stream.lifecycle",
        conversationId,
        runId,
        phase: "end",
        tokensUsed,
      });
      return { runId, response: result.text, tokensUsed };
    }

    // Max iterations reached
    const finalResponse = "Task may require more iterations to complete.";
    await this.emitEvent({
      type: "speak",
      conversationId,
      message: finalResponse,
      runId
    });
    await this.emitEvent({
      type: "stream.lifecycle",
      conversationId,
      runId,
      phase: "end",
      tokensUsed: 0,
    });
    return { runId, response: finalResponse };
  }

  private async initialize(
    runId: string,
    conversationId: string,
    message: string
  ): Promise<{
    systemPrompt: string;
    llmModel: LanguageModel;
    availableTools: Record<string, Tool>;
    memoryManager: UnifiedMemoryManager;
    temperature: number | undefined;
  }> {
    const config = await loadConfig();
    const homedir = resolveAgentHomedir(config, this.agentId);

    const metadata = agentDiscovery.getMetadata(this.agentId);
    if (!metadata) {
      throw new Error(`Agent "${this.agentId}" not found in discovery service`);
    }

    const systemPrompt = await new IdentityLoader().getSystemPrompt(
      metadata.agentDir
    );
    const llmModel = await LLMProvider.getInstance().fastCheap();

    const toolRegistry = new ToolRegistry();
    const availableTools = Object.fromEntries(toolRegistry.getToolsMap());

    const memoryManager = UnifiedMemoryManager.create(homedir, this.agentId);

    // Get temperature from conversation entry
    const conversationManager = new ConversationManager(this.agentId);
    const conversationEntry = conversationManager.getConversationEntry(conversationId);
    const temperature = conversationEntry?.temperatureOverride;

    return {
      systemPrompt,
      llmModel,
      availableTools,
      memoryManager,
      temperature,
    };
  }

}
