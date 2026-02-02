import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, jsonSchema, type Tool, type ModelMessage } from "ai";
import type { LLMProvider, LLMCallParams, LLMResponse, LLMMessage } from "./types.js";

/**
 * OpenAI provider using Vercel AI SDK
 * This implementation automatically handles max_completion_tokens vs max_tokens
 * and provides better error handling and streaming support
 */
export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private openai: ReturnType<typeof createOpenAI>;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.openai = createOpenAI({
      apiKey,
    });
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = { id: "gpt-4o" },
      tools,
    } = params;
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:23',message:'OpenAIProvider.call entry',data:{messagesLength:messages.length,modelId:model.id,hasTools:!!tools},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion

    // Convert messages to AI SDK format
    const aiMessages = this.convertMessages(messages, systemPrompt);
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:34',message:'After convertMessages',data:{aiMessagesLength:aiMessages.length,aiMessageRoles:aiMessages.map(m=>m.role)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion

    // Convert tools to AI SDK ToolSet format
    const toolSet = tools?.reduce((acc, tool) => {
      acc[tool.function.name] = {
        description: tool.function.description,
        inputSchema: jsonSchema(tool.function.parameters as Record<string, unknown>),
      };
      return acc;
    }, {} as Record<string, Tool>);

    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:51',message:'Before generateText call',data:{aiMessagesLength:aiMessages.length,aiMessagesStructure:aiMessages.map((m,i)=>({index:i,role:m.role,hasToolCalls:!!(m as any).toolCalls,toolCallId:(m as any).content?.[0]?.toolCallId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
    try {
      const result = await generateText({
        model: this.openai(model.id),
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
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:77',message:'OpenAI API error caught in call()',data:{errorMessage:error instanceof Error ? error.message : String(error),aiMessagesLength:aiMessages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
      // #endregion
      throw new Error(
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = { id: "gpt-4o" },
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
        model: this.openai(model.id),
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
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private convertMessages(
    messages: LLMMessage[],
    systemPrompt?: string
  ): ModelMessage[] {
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:119',message:'convertMessages entry',data:{messageCount:messages.length,messageRoles:messages.map(m=>m.role),hasSystemPrompt:!!systemPrompt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:136',message:'Found assistant msg with toolCalls',data:{toolCallIds:msg.toolCalls.map(tc=>tc.id),toolCallNames:msg.toolCalls.map(tc=>tc.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        for (const tc of msg.toolCalls) {
          toolCallMap.set(tc.id, tc.name);
        }
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:141',message:'ToolCallMap built',data:{mapSize:toolCallMap.size,mapEntries:Array.from(toolCallMap.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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
    
    // Track if we've seen the last assistant message yet
    let seenLastAssistant = false;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:164',message:'Processing message in second pass',data:{index:i,role:msg.role,toolCallId:msg.toolCallId,hasToolCalls:!!msg.toolCalls,isLastAssistant:i===lastAssistantIndex,aiMessagesLength:aiMessages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,E'})}).catch(()=>{});
      // #endregion
      
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
          
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:186',message:'Processing tool message',data:{toolCallId:msg.toolCallId,foundToolName:toolName,isForLastAssistant,lastAssistantIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,E'})}).catch(()=>{});
          // #endregion
          
          if (toolName && isForLastAssistant) {
            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:192',message:'Adding tool result to aiMessages (current turn)',data:{toolCallId:msg.toolCallId,toolName,aiMessagesLengthBefore:aiMessages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
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
          } else {
            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:207',message:'Skipping tool result from previous turn',data:{toolCallId:msg.toolCallId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
          }
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:212',message:'Skipping tool result (not immediately after last assistant)',data:{toolCallId:msg.toolCallId,i,lastAssistantIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
        }
        continue;
      } else if (msg.role === "assistant") {
        if (i === lastAssistantIndex) {
          seenLastAssistant = true;
          // This is the last assistant message - include it with tool calls if present
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:220',message:'Adding last assistant msg with toolCalls',data:{toolCallIds:msg.toolCalls.map(tc=>tc.id),aiMessagesLengthBefore:aiMessages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,E'})}).catch(()=>{});
            // #endregion
            const toolCallsForSDK = msg.toolCalls.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.name,
              args: JSON.parse(tc.arguments),
            }));
            aiMessages.push({
              role: "assistant",
              content: msg.content || "",
              toolCalls: toolCallsForSDK,
            } as ModelMessage);
          } else {
            aiMessages.push({
              role: "assistant",
              content: msg.content || "",
            });
          }
        } else {
          // Previous assistant messages - only include text content, skip tool calls
          // This avoids SDK validation errors for tool calls from previous turns
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:235',message:'Adding previous assistant msg (text only, skipping tool calls)',data:{hasToolCalls:!!msg.toolCalls,content:msg.content?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/1837ab77-87c8-488b-a311-1ab411424999',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.ts:210',message:'convertMessages exit',data:{aiMessagesLength:aiMessages.length,aiMessageRoles:aiMessages.map(m=>m.role)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,E'})}).catch(()=>{});
    // #endregion
    return aiMessages;
  }
}
