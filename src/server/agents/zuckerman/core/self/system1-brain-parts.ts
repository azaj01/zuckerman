import { generateText, Output } from "ai";
import { z } from "zod";
import type { Tool, LanguageModel } from "ai";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";

const validationSchema = z.object({
  satisfied: z.boolean(),
  reason: z.string(),
  missing: z.array(z.string()),
});

export class System1BrainParts {
  /**
   * Context Building - Proactively gathers missing information needed to fulfill a request
   */
  static async buildContext(
    runId: string,
    userRequest: string,
    conversationId: string,
    llmModel: LanguageModel,
    availableTools: Record<string, Tool>
  ): Promise<{ enrichedMessage: string; messageToAdd?: { role: "system"; content: string; runId: string } }> {
    const messages: ConversationMessage[] = [
      {
        role: "system",
        content: `Gather missing information needed to fulfill: "${userRequest}"

IMPORTANT CONTEXT: You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All information gathering must be done by you alone.

Use available tools to find answers. Never ask the user - always use tools to discover information yourself.
When you have enough context, summarize what you've gathered.`,
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: `User request: "${userRequest}"

What information is needed? Start gathering it using tools.`,
        timestamp: Date.now(),
      },
    ];

    let iterations = 0;
    const MAX_CONTEXT_ITERATIONS = 5;

    while (iterations < MAX_CONTEXT_ITERATIONS) {
      iterations++;
      const result = await generateText({
        model: llmModel,
        messages: convertToModelMessages(messages),
        temperature: 0.3,
        tools: availableTools,
      });

      messages.push({
        role: "assistant",
        content: result.text,
        timestamp: Date.now(),
      });

      // Check if we need to continue gathering
      messages.push({
        role: "user",
        content:
          "If you have enough context, summarize. If not, use tools to gather more.",
        timestamp: Date.now(),
      });

      // If the response indicates completion, break
      if (
        result.text.toLowerCase().includes("summary") ||
        result.text.toLowerCase().includes("gathered")
      ) {
        break;
      }
    }

    const summary =
      messages.filter((m) => m.role === "assistant").pop()?.content ||
      "Context gathering completed.";

    if (summary && summary !== "Context gathering completed.") {
      return {
        enrichedMessage: `${userRequest}\n\n[Context: ${summary}]`,
        messageToAdd: {
          role: "system",
          content: `Context gathered:\n${summary}`,
          runId
        }
      };
    }

    return { enrichedMessage: userRequest };
  }

  /**
   * Validation - Verifies if the system result satisfies the user's request
   */
  static async validate(
    userRequest: string,
    systemResult: string,
    llmModel: LanguageModel,
    availableTools: Record<string, Tool>
  ): Promise<{ satisfied: boolean; reason: string; missing: string[] }> {
    const messages: ConversationMessage[] = [
      {
        role: "system",
        content: `You are a validation assistant. Verify if the system result satisfies the user's request.

IMPORTANT CONTEXT: You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All validation must be done by you alone.

User asked: "${userRequest}"
System did: ${systemResult}

Use available tools to verify things if needed (check files, run commands, etc.).`,
        timestamp: Date.now(),
      },
      {
        role: "user",
        content:
          "Verify if the system result satisfies the user's request. Use tools if needed to check things.",
        timestamp: Date.now(),
      },
    ];

    const result = await generateText({
      model: llmModel,
      messages: convertToModelMessages(messages),
      temperature: 0.3,
      tools: availableTools,
      output: Output.object({ schema: validationSchema }),
    });

    return result.output;
  }
}
