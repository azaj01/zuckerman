import type { Tool } from "../terminal/index.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import { getChannelRegistry } from "./registry.js";
import { SessionManager } from "@server/agents/zuckerman/sessions/index.js";
import { loadSessionStore, resolveSessionStorePath } from "@server/agents/zuckerman/sessions/store.js";

export function createTelegramTool(): Tool {
  return {
    definition: {
      name: "telegram",
      description: "Send a message via Telegram. Use this when the user asks you to send a Telegram message or communicate via Telegram. If the user asks to send a message to themselves or 'me', you can omit the 'to' parameter and it will automatically use the current Telegram chat. Otherwise, provide the Telegram chat ID (numeric string).",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message text to send",
          },
          to: {
            type: "string",
            description: "Optional: Telegram chat ID (user ID or chat ID as a numeric string, e.g., '123456789'). If omitted or set to 'me', will send to the current Telegram chat where the user is messaging from.",
          },
        },
        required: ["message"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        // Check if tool is allowed
        if (securityContext && !isToolAllowed("telegram", securityContext.toolPolicy)) {
          return {
            success: false,
            error: "Telegram tool is not allowed in this security context",
          };
        }

        const { message, to } = params as { message: string; to?: string };

        if (!message) {
          return {
            success: false,
            error: "Message is required",
          };
        }

        // Try to auto-detect chat ID from session if not provided
        let chatId = to;
        if (!chatId || chatId === "me" || chatId.toLowerCase() === "myself") {
          if (executionContext?.sessionId && securityContext?.agentId) {
            try {
              // Load session store to get delivery context (skip cache to get latest data)
              const storePath = resolveSessionStorePath(securityContext.agentId);
              const store = loadSessionStore(storePath, { skipCache: true });
              
              // Find session entry by sessionId
              const sessionEntry = Object.values(store).find(
                entry => entry.sessionId === executionContext.sessionId
              );
              
              if (sessionEntry) {
                // Check if this session is from Telegram channel
                const isTelegramSession = sessionEntry.lastChannel === "telegram" || 
                                         sessionEntry.origin?.channel === "telegram";
                
                if (isTelegramSession) {
                  // Try deliveryContext first, then lastTo
                  chatId = sessionEntry.deliveryContext?.to || sessionEntry.lastTo;
                  
                  if (chatId) {
                    console.log(`[Telegram] Auto-detected chat ID ${chatId} from session ${executionContext.sessionId}`);
                  }
                } else {
                  // If not a Telegram session, try to find any recent Telegram session
                  // This handles cases where user is chatting via app but wants to send via Telegram
                  const telegramEntries = Object.values(store)
                    .filter(entry => 
                      (entry.lastChannel === "telegram" || entry.origin?.channel === "telegram") &&
                      entry.deliveryContext?.to
                    )
                    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                  
                  if (telegramEntries.length > 0) {
                    chatId = telegramEntries[0].deliveryContext?.to || telegramEntries[0].lastTo;
                    console.log(`[Telegram] Using chat ID ${chatId} from most recent Telegram session`);
                  }
                }
              } else {
                console.warn(`[Telegram] Session entry not found for sessionId: ${executionContext.sessionId}`);
              }
            } catch (err) {
              console.warn("[Telegram] Failed to load session for auto-detection:", err);
            }
          }
          
          if (!chatId) {
            return {
              success: false,
              error: "Chat ID is required. If you're replying to a Telegram message in this conversation, the chat ID should be automatically detected. Otherwise, please provide the Telegram chat ID (numeric string).",
            };
          }
        }

        // Check if channel registry is available
        const channelRegistry = getChannelRegistry();
        if (!channelRegistry) {
          return {
            success: false,
            error: "Telegram channel registry is not available. Make sure Telegram is configured and connected.",
          };
        }

        // Get Telegram channel
        const telegramChannel = channelRegistry.get("telegram");
        if (!telegramChannel) {
          return {
            success: false,
            error: "Telegram channel is not configured. Please set up Telegram in settings.",
          };
        }

        // Check if connected
        if (!telegramChannel.isConnected()) {
          return {
            success: false,
            error: "Telegram is not connected. Please connect Telegram in settings first.",
          };
        }

        // Send message
        await telegramChannel.send(message, chatId);

        return {
          success: true,
          result: `Message sent successfully to Telegram chat ${chatId}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send Telegram message";
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}
