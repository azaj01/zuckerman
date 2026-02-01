import type { LLMProvider, LLMCallParams, LLMResponse, LLMMessage } from "./types.js";

export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1/chat/completions";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    this.apiKey = apiKey;
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = "google/gemini-3-flash-preview", // Google Gemini Flash - fast and capable
      tools,
    } = params;

    const openrouterMessages = this.formatMessages(messages, systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: openrouterMessages,
      temperature,
      max_tokens: maxTokens,
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: tool.function,
      }));
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://github.com/zuckerman",
        "X-Title": process.env.OPENROUTER_X_TITLE || "Zuckerman",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message?: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        delta?: { content: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model?: string;
    };

    const message = data.choices[0]?.message;
    const content = message?.content || "";
    const toolCalls = message?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content,
      tokensUsed: data.usage
        ? {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
            total: data.usage.total_tokens,
          }
        : undefined,
      model: data.model,
      finishReason: data.choices[0]?.finish_reason,
      toolCalls,
    };
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = "google/gemini-2.0-flash-exp", // Google Gemini Flash - fast and capable
    } = params;

    const openrouterMessages = this.formatMessages(messages, systemPrompt);

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://github.com/zuckerman",
        "X-Title": process.env.OPENROUTER_X_TITLE || "Zuckerman",
      },
      body: JSON.stringify({
        model,
        messages: openrouterMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  private formatMessages(messages: LLMMessage[], systemPrompt?: string): any[] {
    const openrouterMessages: any[] = [];

    if (systemPrompt) {
      openrouterMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      // CRITICAL: Skip tool messages without valid toolCallId (invalid state - these cannot be sent to API)
      const hasToolCallId = msg.toolCallId && typeof msg.toolCallId === "string" && msg.toolCallId.trim().length > 0;
      
      if (msg.role === "tool" && !hasToolCallId) {
        console.warn("Skipping invalid tool message (missing toolCallId):", {
          content: msg.content.substring(0, 100),
        });
        continue;
      }

      const openrouterMsg: any = {
        role: msg.role,
        content: msg.content || null,
      };

      // Handle tool calls in assistant messages
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        openrouterMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      // Handle tool results - ensure tool_call_id is set for tool role messages
      if (msg.role === "tool" || hasToolCallId) {
        openrouterMsg.role = "tool";
        openrouterMsg.tool_call_id = msg.toolCallId!;
      }

      // Final validation
      if (openrouterMsg.role === "tool" && !openrouterMsg.tool_call_id) {
        continue;
      }

      openrouterMessages.push(openrouterMsg);
    }

    return openrouterMessages;
  }
}
