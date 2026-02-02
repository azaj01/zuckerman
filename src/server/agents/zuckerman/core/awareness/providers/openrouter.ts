import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, streamText, jsonSchema, type Tool, type ModelMessage } from "ai";
import type { LLMProvider, LLMCallParams, LLMResponse, LLMMessage } from "./types.js";

/**
 * OpenRouter provider using Vercel AI SDK
 * Provides access to 300+ models through OpenRouter with unified error handling
 */
export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";
  private openrouter: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }

    this.openrouter = createOpenRouter({
      apiKey,
      fetch: this.createCustomFetch(),
    });
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    if (!params.model?.id) {
      throw new Error("Model is required for OpenRouter provider");
    }
    const modelId = params.model.id.trim();
    const { aiMessages, toolSet } = this.prepareRequest(params);

    try {
      const result = await generateText({
        model: this.openrouter(modelId),
        messages: aiMessages,
        temperature: params.temperature ?? 1.0,
        maxTokens: params.maxTokens ?? 4096,
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
        model: result.response?.modelId ?? modelId,
        finishReason: result.finishReason,
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          arguments: JSON.stringify("input" in tc ? tc.input : {}),
        })),
      };
    } catch (error) {
      throw this.handleError(error, modelId);
    }
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    if (!params.model?.id) {
      throw new Error("Model is required for OpenRouter provider");
    }
    const modelId = params.model.id.trim();
    const { aiMessages, toolSet } = this.prepareRequest(params);

    try {
      const result = await streamText({
        model: this.openrouter(modelId),
        messages: aiMessages,
        temperature: params.temperature ?? 1.0,
        maxTokens: params.maxTokens ?? 4096,
        tools: toolSet,
      } as Parameters<typeof streamText>[0]);

      for await (const chunk of result.textStream) {
        yield chunk;
      }
    } catch (error) {
      throw this.handleError(error, modelId);
    }
  }

  private createCustomFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("HTTP-Referer", process.env.OPENROUTER_HTTP_REFERER || "https://github.com/zuckerman");
      headers.set("X-Title", process.env.OPENROUTER_X_TITLE || "Zuckerman");
      return fetch(input, { ...init, headers });
    };
  }

  private prepareRequest(params: LLMCallParams) {
    const aiMessages = this.convertMessages(params.messages, params.systemPrompt);
    const toolSet = params.tools?.reduce((acc, tool) => {
      acc[tool.function.name] = {
        description: tool.function.description,
        inputSchema: jsonSchema(tool.function.parameters as Record<string, unknown>),
      };
      return acc;
    }, {} as Record<string, Tool>);

    return { aiMessages, toolSet };
  }

  private handleError(error: unknown, modelId: string): Error {
    const errorMessage = this.extractErrorMessage(error);
    const enhancedMessage = this.enhanceErrorMessage(errorMessage, modelId);
    return new Error(`OpenRouter API error: ${enhancedMessage}`);
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      let message = error.message;

      // Extract nested error from AI SDK error structure
      if (error.cause instanceof Error) {
        message = error.cause.message;
      } else if (typeof error.cause === "string") {
        message = error.cause;
      }

      // Check for response data in error
      const response = (error as any).response;
      if (response?.data?.error?.message) {
        message = response.data.error.message;
      }

      // Recursively check nested errors
      let currentError: any = error;
      while (currentError) {
        if (currentError.message && typeof currentError.message === "string") {
          const nestedMessage = currentError.message;
          if (nestedMessage.includes("OpenAI API error") || nestedMessage.includes("does not exist")) {
            message = nestedMessage;
            break;
          }
        }
        currentError = currentError.cause || currentError.error || currentError.originalError;
      }

      // Replace OpenAI error labels with OpenRouter (case-insensitive, handle variations)
      message = message.replace(/OpenAI API error/gi, "OpenRouter API error");
      message = message.replace(/OpenAI/gi, "OpenRouter");
      
      return message;
    }

    let errorStr = String(error);
    // Replace OpenAI error labels in string representation too
    errorStr = errorStr.replace(/OpenAI API error/gi, "OpenRouter API error");
    errorStr = errorStr.replace(/OpenAI/gi, "OpenRouter");
    return errorStr;
  }

  private enhanceErrorMessage(errorMessage: string, modelId: string): string {
    const lowerModelId = modelId.toLowerCase();

    // TTS model detection
    if (lowerModelId.includes("tts")) {
      return `Model '${modelId}' is a text-to-speech (TTS) model, not a chat completion model. Please select a chat model like 'openai/gpt-4o', 'google/gemini-2.0-flash-exp', or 'anthropic/claude-3-5-sonnet'.`;
    }

    // Model not found/available
    if (
      errorMessage.includes("does not exist") ||
      errorMessage.includes("not found") ||
      errorMessage.includes("not available") ||
      errorMessage.includes("The requested model")
    ) {
      // Check if it's a Gemini model and suggest correct naming
      if (lowerModelId.includes("gemini")) {
        return `Model '${modelId}' is not available on OpenRouter. The model ID may be incorrect. For Gemini models, try: 'google/gemini-2.0-flash-exp', 'google/gemini-pro', or 'google/gemini-flash-1.5'. Please check https://openrouter.ai/models for the complete list of available models. Make sure you're using the exact model ID from OpenRouter, not a display name.`;
      }
      return `Model '${modelId}' is not available on OpenRouter. ${errorMessage}. Please check https://openrouter.ai/models for available models. Common models: 'openai/gpt-4o', 'google/gemini-2.0-flash-exp', 'anthropic/claude-3-5-sonnet', 'deepseek/deepseek-chat'. Make sure you're using the exact model ID from OpenRouter, not a display name.`;
    }

    // Model not supported
    if (
      errorMessage.includes("not supported") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("Responses API")
    ) {
      return `Model '${modelId}' is not supported on OpenRouter. ${errorMessage}. Please check https://openrouter.ai/models for available models. Make sure you're using the exact model ID from OpenRouter, not a display name.`;
    }

    // Type validation errors (e.g., content format issues)
    if (
      errorMessage.includes("Type validation failed") ||
      errorMessage.includes("invalid_type") ||
      errorMessage.includes("expected string") ||
      errorMessage.includes("received array")
    ) {
      return `OpenRouter API validation error: ${errorMessage}. This may be due to a message format issue. Please ensure you're using a valid model ID from https://openrouter.ai/models.`;
    }

    return errorMessage;
  }

  private convertMessages(
    messages: LLMMessage[],
    systemPrompt?: string
  ): ModelMessage[] {
    const aiMessages: ModelMessage[] = [];
    // Map toolCallId to toolName from previous assistant messages
    const toolCallMap = new Map<string, string>();

    if (systemPrompt) {
      aiMessages.push({ role: "system", content: systemPrompt });
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
      if (msg.role === "system") {
        continue; // Already handled above
      }

      if (msg.role === "tool") {
        if (!msg.toolCallId) {
          console.warn("Skipping invalid tool message (missing toolCallId)");
          continue;
        }
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
            } as ModelMessage);
          }
        }
        // Skip tool results from previous turns
        continue;
      } else if (msg.role === "assistant") {
        if (i === lastAssistantIndex && msg.toolCalls?.length) {
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
