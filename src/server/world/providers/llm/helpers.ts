import type { ModelMessage } from "ai";
import type { ConversationMessage, ToolResultPart } from "@server/agents/zuckerman/conversations/types.js";

/**
 * Convert ConversationMessage[] to ModelMessage[]
 * ConversationMessage now matches ModelMessage format, so conversion is simple
 * Handles backward compatibility for legacy string content in tool messages
 */
export function convertToModelMessages(
  messages: ConversationMessage[]
): ModelMessage[] {
  return messages
    .filter((msg) => {
      if (msg.ignore) return false;
      
      if (msg.role === "tool") {
        // Tool messages must have content as array
        // Handle legacy format: string content with toolCallId
        if (typeof msg.content === "string") {
          return msg.content.trim().length > 0 && !!msg.toolCallId;
        }
        return Array.isArray(msg.content) && msg.content.length > 0;
      }
      
      // For user/assistant/system messages, content must be string or array
      if (typeof msg.content === "string") {
        return msg.content.trim().length > 0;
      }
      if (Array.isArray(msg.content)) {
        return msg.content.length > 0;
      }
      
      return false;
    })
    .map((msg): ModelMessage => {
      // Handle legacy tool message format: convert string + toolCallId to ToolResultPart array
      if (msg.role === "tool" && typeof msg.content === "string" && msg.toolCallId) {
        return {
          role: "tool",
          content: [{
            type: "tool-result",
            toolCallId: msg.toolCallId,
            toolName: "unknown", // Legacy messages don't have toolName
            output: msg.content,
          }] as ToolResultPart[],
        } as ModelMessage;
      }
      
      // ConversationMessage now matches ModelMessage format
      return {
        role: msg.role,
        content: msg.content,
      } as ModelMessage;
    });
}

