import type { Tool } from "../terminal/index.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import { getChannelRegistry } from "./registry.js";
import { SessionManager } from "@server/agents/zuckerman/sessions/index.js";
import { loadSessionStore, resolveSessionStorePath } from "@server/agents/zuckerman/sessions/store.js";

export function createDiscordTool(): Tool {
  return {
    definition: {
      name: "discord",
      description: "Send a message via Discord. Use this when the user asks you to send a Discord message or communicate via Discord. If the user asks to send a message to themselves or 'me', you can omit the 'to' parameter and it will automatically use the current Discord channel or DM. Otherwise, provide the Discord channel ID or user ID (for DMs) as a string.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message text to send",
          },
          to: {
            type: "string",
            description: "Optional: Discord channel ID or user ID (for DMs) as a string. If omitted or set to 'me', will send to the current Discord channel or DM where the user is messaging from.",
          },
        },
        required: ["message"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        // Check if tool is allowed
        if (securityContext && !isToolAllowed("discord", securityContext.toolPolicy)) {
          return {
            success: false,
            error: "Discord tool is not allowed in this security context",
          };
        }

        const { message, to } = params as { message: string; to?: string };

        if (!message) {
          return {
            success: false,
            error: "Message is required",
          };
        }

        // Try to auto-detect channel ID from session if not provided
        let channelId = to;
        if (!channelId || channelId === "me" || channelId.toLowerCase() === "myself") {
          if (executionContext?.sessionId && securityContext?.agentId) {
            try {
              // Load session store to get delivery context
              const storePath = resolveSessionStorePath(securityContext.agentId);
              const store = loadSessionStore(storePath);
              
              // Find session entry by sessionId
              const sessionEntry = Object.values(store).find(
                entry => entry.sessionId === executionContext.sessionId
              );
              
              // Try to get channel ID from delivery context
              if (sessionEntry) {
                // Check if this session is from Discord channel
                if (sessionEntry.lastChannel === "discord" || sessionEntry.origin?.channel === "discord") {
                  channelId = sessionEntry.deliveryContext?.to || 
                              sessionEntry.lastTo;
                }
              }
            } catch (err) {
              console.warn("[Discord] Failed to load session for auto-detection:", err);
            }
          }
          
          if (!channelId) {
            return {
              success: false,
              error: "Channel ID is required. If you're replying to a Discord message in this conversation, the channel ID should be automatically detected. Otherwise, please provide the Discord channel ID or user ID (for DMs) as a string.",
            };
          }
        }

        // Check if channel registry is available
        const channelRegistry = getChannelRegistry();
        if (!channelRegistry) {
          return {
            success: false,
            error: "Discord channel registry is not available. Make sure Discord is configured and connected.",
          };
        }

        // Get Discord channel
        const discordChannel = channelRegistry.get("discord");
        if (!discordChannel) {
          return {
            success: false,
            error: "Discord channel is not configured. Please set up Discord in settings.",
          };
        }

        // Check if connected
        if (!discordChannel.isConnected()) {
          return {
            success: false,
            error: "Discord is not connected. Please connect Discord in settings first.",
          };
        }

        // Send message
        await discordChannel.send(message, channelId);

        return {
          success: true,
          result: `Message sent successfully to Discord channel ${channelId}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send Discord message";
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}
