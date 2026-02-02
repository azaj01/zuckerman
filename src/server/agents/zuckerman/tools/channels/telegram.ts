import type { Tool } from "../terminal/index.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import { getChannelRegistry } from "./registry.js";
import { ConversationManager, deriveConversationKey } from "@server/agents/zuckerman/conversations/index.js";
import { loadConversationStore, resolveConversationStorePath } from "@server/agents/zuckerman/conversations/store.js";

export function createTelegramTool(): Tool {
  return {
    definition: {
      name: "telegram",
      description: "Send a message or media (images, audio, files) via Telegram. Use this when the user asks you to send a Telegram message, image, or file. To send media files, include the file path in the message using one of these formats: (1) 'MEDIA:/path/to/file.png' prefix, (2) markdown image link '![alt](/path/to/image.png)', or (3) direct file path '/path/to/file.png'. The tool automatically detects and sends media files. Supports images (png, jpg, jpeg, gif, webp), audio (mp3, ogg, opus, wav, m4a), and other files as documents. Paths support ~ for home directory and relative paths. If the user asks to send to themselves or 'me', omit the 'to' parameter to auto-detect the current Telegram chat.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message text to send. To send media files, include the file path using: 'MEDIA:/path/to/file.png', markdown '![alt](/path/to/image.png)', or direct path '/path/to/file.png'. Supports images (png, jpg, jpeg, gif, webp), audio (mp3, ogg, opus, wav, m4a), and documents. Paths support ~ (home) and relative paths. Media files are automatically detected and sent.",
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

        // Try to auto-detect chat ID from conversation if not provided
        let chatId = to;
        if (!chatId || chatId === "me" || chatId.toLowerCase() === "myself") {
          if (executionContext?.conversationId && securityContext?.agentId) {
            try {
              // Use ConversationManager to get conversation state, then derive conversationKey for reliable lookup
              const conversationManager = new ConversationManager(securityContext.agentId);
              const conversationState = conversationManager.getConversation(executionContext.conversationId);
              
              if (conversationState) {
                // Derive conversationKey from conversation state
                const conversationKey = deriveConversationKey(
                  securityContext.agentId,
                  conversationState.conversation.type,
                  conversationState.conversation.label
                );
                
                // Load conversation store and look up entry by conversationKey (more reliable than searching by conversationId)
                const storePath = resolveConversationStorePath(securityContext.agentId);
                const store = loadConversationStore(storePath);
                const conversationEntry = store[conversationKey];
                
                // Try to get chat ID from delivery context
                if (conversationEntry) {
                  // Check if this conversation is from Telegram channel
                  if (conversationEntry.lastChannel === "telegram" || conversationEntry.origin?.channel === "telegram") {
                    chatId = conversationEntry.deliveryContext?.to || 
                            conversationEntry.lastTo;
                  }
                }
              } else {
                // Fallback: try to find by conversationId if conversation not in memory
                const storePath = resolveConversationStorePath(securityContext.agentId);
                const store = loadConversationStore(storePath);
                const conversationEntry = Object.values(store).find(
                  entry => entry.conversationId === executionContext.conversationId
                );
                
                if (conversationEntry && (conversationEntry.lastChannel === "telegram" || conversationEntry.origin?.channel === "telegram")) {
                    chatId = conversationEntry.deliveryContext?.to || conversationEntry.lastTo;
                }
              }
            } catch (err) {
              console.warn("[Telegram] Failed to load conversation for auto-detection:", err);
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
