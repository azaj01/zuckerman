import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import type { Tool, LanguageModel } from "ai";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";

const contextSchema = z.object({
  request: z.string(),
  context: z.string().optional(),
  satisfied: z.boolean(),
});

const validationSchema = z.object({
  satisfied: z.boolean(),
  reason: z.string(),
  missing: z.array(z.string()),
});

const MAX_CONTEXT_ITERATIONS = 5;
const MAX_VALIDATION_ITERATIONS = 3;
const CONTEXT_TEMPERATURE = 0.3;
const VALIDATION_TEMPERATURE = 0.3;

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
  ): Promise<{ enrichedMessage: string }> {
    const now = Date.now();
    const messages: ConversationMessage[] = [
      {
        role: "system",
        content: `Gather missing information needed to fulfill: "${userRequest}"

Use available tools to find answers. Never ask the user - always use tools to discover information yourself.
When you have enough context, return a JSON object with "request" (the enriched request), optional "context" (summary of what you gathered), and "satisfied" (boolean indicating if enough context was gathered).`,
        timestamp: now,
      },
      {
        role: "user",
        content: `User request: "${userRequest}"

What information is needed? Start gathering it using tools. When done, return JSON with "request", "context", and "satisfied".`,
        timestamp: now,
      },
    ];

    const result = await generateText({
      model: llmModel,
      messages: convertToModelMessages(messages),
      temperature: CONTEXT_TEMPERATURE,
      tools: availableTools,
      stopWhen: stepCountIs(MAX_CONTEXT_ITERATIONS),
      output: Output.object({ schema: contextSchema }),
    });

    if (result.output) {
      const contextResult = result.output as z.infer<typeof contextSchema>;
      return { enrichedMessage: contextResult.request };
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
    const now = Date.now();
    const messages: ConversationMessage[] = [
      {
        role: "system",
        content: `You are a validation assistant. Verify if the system result satisfies the user's request.

User asked: "${userRequest}"
System did: ${systemResult}

You may use available tools to verify things if needed (check files, run commands, etc.), but you MUST return a JSON object with your validation result. The JSON must have "satisfied" (boolean), "reason" (string), and "missing" (array of strings).`,
        timestamp: now,
      },
      {
        role: "user",
        content: "Verify if the system result satisfies the user's request. You may use tools if needed, but you must return a JSON object with your validation result.",
        timestamp: now,
      },
    ];

    const result = await generateText({
      model: llmModel,
      messages: convertToModelMessages(messages),
      temperature: VALIDATION_TEMPERATURE,
      tools: availableTools,
      stopWhen: stepCountIs(MAX_VALIDATION_ITERATIONS),
      output: Output.object({ schema: validationSchema }),
    });

    // If parsing failed, return a default validation result
    if (!result.output) {
      return {
        satisfied: true,
        reason: "Validation parsing failed - assuming satisfied to continue",
        missing: [],
      };
    }

    return result.output;
  }
}
