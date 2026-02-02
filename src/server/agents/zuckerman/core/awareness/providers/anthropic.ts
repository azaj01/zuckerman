import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, streamText, jsonSchema, type Tool, type ModelMessage } from "ai";
import type { LLMProvider, LLMCallParams, LLMResponse, LLMMessage } from "./types.js";

/**
 * Anthropic provider using Vercel AI SDK
 * This implementation provides better error handling and streaming support
 */
export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private anthropic: ReturnType<typeof createAnthropic>;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Anthropic API key is required");
    }
    this.anthropic = createAnthropic({
      apiKey,
    });
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = { id: "claude-3-5-sonnet-20241022" },
      tools,
    } = params;

    // Convert messages to AI SDK format
    const aiMessages = this.convertMessages(messages, systemPrompt);

    // Convert tools to AI SDK ToolSet format
    const toolSet = tools?.reduce((acc, tool) => {
      acc[tool.function.name] = {
        description: tool.function.description,
        inputSchema: jsonSchema(tool.function.parameters as Record<string, unknown>),
      };
      return acc;
    }, {} as Record<string, Tool>);

    try {
      const result = await generateText({
        model: this.anthropic(model.id),
        messages: aiMessages,
        temperature,
        maxTokens: maxTokens,
        tools: toolSet,
      } as Parameters<typeof generateText>[0]);

      return {
        content: result.text,
        tokensUsed: result.usage
          ? {
              input: result.usage.inputTokens ?? 0,
              output: result.usage.outputTokens ?? 0,
              total: result.usage.totalTokens ?? 0,
            }
          : undefined,
        model: result.response?.modelId ?? model.id,
        finishReason: result.finishReason,
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          arguments: JSON.stringify("input" in tc ? tc.input : {}),
        })),
      };
    } catch (error) {
      throw new Error(
        `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = { id: "claude-3-5-sonnet-20241022" },
      tools,
    } = params;

    // Convert messages to AI SDK format
    const aiMessages = this.convertMessages(messages, systemPrompt);

    // Convert tools to AI SDK ToolSet format
    const toolSet = tools?.reduce((acc, tool) => {
      acc[tool.function.name] = {
        description: tool.function.description,
        inputSchema: jsonSchema(tool.function.parameters as Record<string, unknown>),
      };
      return acc;
    }, {} as Record<string, Tool>);

    try {
      const result = await streamText({
        model: this.anthropic(model.id),
        messages: aiMessages,
        temperature,
        maxTokens: maxTokens,
        tools: toolSet,
      } as Parameters<typeof streamText>[0]);

      for await (const chunk of result.textStream) {
        yield chunk;
      }
    } catch (error) {
      throw new Error(
        `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private convertMessages(
    messages: LLMMessage[],
    systemPrompt?: string
  ): ModelMessage[] {
    const aiMessages: ModelMessage[] = [];
    // Map toolCallId to toolName from previous assistant messages
    const toolCallMap = new Map<string, string>();

    if (systemPrompt) {
      aiMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // First pass: build tool call map
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          toolCallMap.set(tc.id, tc.name);
        }
      }
    }

    // Second pass: convert messages
    // IMPORTANT: The Vercel AI SDK has a known issue (#8216) where it validates tool results
    // against tool calls from the CURRENT API call, not from previous turns in conversation history.
    // To work around this, we skip tool calls and tool results from previous turns and only
    // include the final assistant response text. Tool calls/results from the current turn
    // are handled separately in handleToolCalls.
    
    // Find the last assistant message - this is likely the one with tool calls from current turn
    let lastAssistantIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        lastAssistantIndex = i;
        break;
      }
    }
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // Skip invalid tool messages
      if (msg.role === "tool" && !msg.toolCallId) {
        console.warn("Skipping invalid tool message (missing toolCallId):", {
          content: msg.content.substring(0, 100),
        });
        continue;
      }

      if (msg.role === "system") {
        // System messages are handled separately
        continue;
      }

      if (msg.role === "tool" && msg.toolCallId) {
        // Only include tool results if they're for the last assistant message (current turn)
        // Skip tool results from previous turns to avoid SDK validation errors
        if (i === lastAssistantIndex + 1 && lastAssistantIndex >= 0) {
          const lastAssistantMsg = messages[lastAssistantIndex];
          const toolName = toolCallMap.get(msg.toolCallId);
          const isForLastAssistant = lastAssistantMsg.toolCalls?.some(tc => tc.id === msg.toolCallId);
          
          if (toolName && isForLastAssistant) {
            aiMessages.push({
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: msg.toolCallId,
                  toolName,
                  output: {
                    type: "text",
                    value: msg.content || "",
                  },
                } as any,
              ],
            });
          }
        }
        // Skip tool results from previous turns
        continue;
      } else if (msg.role === "assistant") {
        if (i === lastAssistantIndex && msg.toolCalls && msg.toolCalls.length > 0) {
          // This is the last assistant message - include it with tool calls if present
          aiMessages.push({
            role: "assistant",
            content: msg.content || "",
            toolCalls: msg.toolCalls.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.name,
              args: JSON.parse(tc.arguments),
            })),
          } as ModelMessage);
        } else {
          // Previous assistant messages - only include text content, skip tool calls
          // This avoids SDK validation errors for tool calls from previous turns
          aiMessages.push({
            role: "assistant",
            content: msg.content || "",
          });
        }
      } else {
        // user role
        aiMessages.push({
          role: "user",
          content: msg.content || "",
        });
      }
    }

    return aiMessages;
  }
}
