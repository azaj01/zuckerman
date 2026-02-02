import type { Tool } from "../terminal/index.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import { getChannelRegistry } from "./registry.js";
import { SessionManager } from "@server/agents/zuckerman/sessions/index.js";
import { loadSessionStore, resolveSessionStorePath } from "@server/agents/zuckerman/sessions/store.js";

export function createSignalTool(): Tool {
  return {
    definition: {
      name: "signal",
      description: "Send a message via Signal. Use this when the user asks you to send a Signal message or communicate via Signal. If the user asks to send a message to themselves or 'me', you can omit the 'to' parameter and it will automatically use the current Signal chat where the user is messaging from. Otherwise, provide the Signal phone number (with country code, e.g., '+1234567890').",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message text to send",
          },
          to: {
            type: "string",
            description: "Optional: Signal phone number with country code (e.g., '+1234567890'). If omitted or set to 'me', will send to the current Signal chat where the user is messaging from.",
          },
        },
        required: ["message"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        // Check if tool is allowed
        if (securityContext && !isToolAllowed("signal", securityContext.toolPolicy)) {
          return {
            success: false,
            error: "Signal tool is not allowed in this security context",
          };
        }

        const { message, to } = params as { message: string; to?: string };

        if (!message) {
          return {
            success: false,
            error: "Message is required",
          };
        }

        // Try to auto-detect phone number from session if not provided
        let phoneNumber = to;
        if (!phoneNumber || phoneNumber === "me" || phoneNumber.toLowerCase() === "myself") {
          if (executionContext?.sessionId && securityContext?.agentId) {
            try {
              // Load session store to get delivery context
              const storePath = resolveSessionStorePath(securityContext.agentId);
              const store = loadSessionStore(storePath);
              
              // Find session entry by sessionId
              const sessionEntry = Object.values(store).find(
                entry => entry.sessionId === executionContext.sessionId
              );
              
              // Try to get phone number from delivery context
              if (sessionEntry) {
                // Check if this session is from Signal channel
                if (sessionEntry.lastChannel === "signal" || sessionEntry.origin?.channel === "signal") {
                  phoneNumber = sessionEntry.deliveryContext?.to || 
                                sessionEntry.lastTo;
                }
              }
            } catch (err) {
              console.warn("[Signal] Failed to load session for auto-detection:", err);
            }
          }
          
          if (!phoneNumber) {
            return {
              success: false,
              error: "Phone number is required. If you're replying to a Signal message in this conversation, the phone number should be automatically detected. Otherwise, please provide the Signal phone number with country code (e.g., '+1234567890').",
            };
          }
        }

        // Check if channel registry is available
        const channelRegistry = getChannelRegistry();
        if (!channelRegistry) {
          return {
            success: false,
            error: "Signal channel registry is not available. Make sure Signal is configured and connected.",
          };
        }

        // Get Signal channel
        const signalChannel = channelRegistry.get("signal");
        if (!signalChannel) {
          return {
            success: false,
            error: "Signal channel is not configured. Please set up Signal in settings.",
          };
        }

        // Check if connected
        if (!signalChannel.isConnected()) {
          return {
            success: false,
            error: "Signal is not connected. Please connect Signal in settings first. Note: Signal requires signal-cli setup for full functionality.",
          };
        }

        // Send message
        await signalChannel.send(message, phoneNumber);

        return {
          success: true,
          result: `Message sent successfully to Signal ${phoneNumber}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send Signal message";
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}
