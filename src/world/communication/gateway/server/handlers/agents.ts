import type { GatewayRequestHandlers } from "../types.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { AgentRuntimeFactory } from "@world/runtime/agents/index.js";
import { loadConfig } from "@world/config/index.js";
import { resolveSecurityContext } from "@world/execution/security/context/index.js";
import { resolveAgentLand } from "@world/communication/routing/resolver.js";
import type { StreamEvent } from "@world/runtime/agents/types.js";
import { sendEvent } from "../connection.js";

export function createAgentHandlers(
  sessionManager: SessionManager,
  agentFactory: AgentRuntimeFactory,
): Partial<GatewayRequestHandlers> {
  return {
    "agents.list": async ({ respond }) => {
      try {
        const agents = await agentFactory.listAgents();
        respond(true, { agents });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to list agents",
        });
      }
    },

    "agent.run": async ({ respond, params, client }) => {
      const sessionId = params?.sessionId as string | undefined;
      const message = params?.message as string | undefined;
      const config = await loadConfig();
      
      // Resolve agent ID - check params first, then config
      let agentId = params?.agentId as string | undefined;
      if (!agentId) {
        // Get from agents.list default
        const agents = config.agents?.list || [];
        const defaultAgent = agents.find(a => a.default) || agents[0];
        agentId = defaultAgent?.id || "zuckerman";
      }
      
      const thinkingLevel = params?.thinkingLevel as string | undefined;
      const model = params?.model as string | undefined;
      const temperature = params?.temperature as number | undefined;

      if (!sessionId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing sessionId",
        });
        return;
      }

      if (!message) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing message",
        });
        return;
      }

      try {
        // Get the correct SessionManager for this agent
        const agentSessionManager = agentFactory.getSessionManager(agentId);
        
        // Get or create session
        let session = agentSessionManager.getSession(sessionId);
        let actualSessionId = sessionId;
        if (!session) {
          const newSession = agentSessionManager.createSession(`session-${sessionId}`, "main", agentId);
          session = agentSessionManager.getSession(newSession.id)!;
          actualSessionId = newSession.id; // Use the actual created session ID
        }

        // Resolve land directory for this agent
        const landDir = resolveAgentLand(config, agentId);
        const securityContext = await resolveSecurityContext(
          config.security,
          sessionId,
          session.session.type,
          agentId,
          landDir,
        );

        // Add user message to session (use actualSessionId, not the original sessionId)
        await agentSessionManager.addMessage(actualSessionId, "user", message);

        // Get agent runtime
        let runtime: any = null;
        let loadError: string | undefined;
        try {
          runtime = await agentFactory.getRuntime(agentId, true); // Clear cache on error
        } catch (err) {
          loadError = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          console.error(`[AgentHandler] Error loading runtime for "${agentId}":`, loadError);
          if (errorStack) {
            console.error(`[AgentHandler] Stack trace:`, errorStack);
          }
          
          // Try clearing cache and retrying once
          try {
            agentFactory.clearCache(agentId);
            runtime = await agentFactory.getRuntime(agentId, false); // Don't retry again
          } catch (retryErr) {
            const retryError = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error(`[AgentHandler] Retry also failed for "${agentId}":`, retryError);
            loadError = retryError; // Use retry error if it's more specific
          }
        }
        
        if (!runtime) {
          // Check if agent is listed but runtime failed to load
          const listedAgents = await agentFactory.listAgents();
          const isListed = listedAgents.includes(agentId);
          
          // Get stored error if loadError is not set
          if (!loadError && agentFactory.getLoadError) {
            loadError = agentFactory.getLoadError(agentId);
          }
          
          const errorMessage = loadError || "Failed to load runtime (check gateway logs for details)";
          
          respond(false, undefined, {
            code: "AGENT_NOT_FOUND",
            message: isListed 
              ? `Agent "${agentId}" is listed but failed to load. Error: ${errorMessage}`
              : `Agent "${agentId}" not found. Available agents: ${listedAgents.join(", ") || "none"}`,
          });
          return;
        }

        // Create streaming callback to emit events
        const streamCallback = (event: StreamEvent) => {
          // Emit event to the client
          sendEvent(client.socket, {
            type: "event",
            event: `agent.stream.${event.type}`,
            payload: {
              ...event.data,
              sessionId: actualSessionId,
            },
          });
        };

        // Pass security context to runtime (use actualSessionId)
        const result = await runtime.run({
          sessionId: actualSessionId,
          message,
          thinkingLevel: thinkingLevel as any,
          model,
          temperature,
          securityContext,
          stream: streamCallback,
        });

        // Add assistant response to session (use actualSessionId)
        await agentSessionManager.addMessage(actualSessionId, "assistant", result.response);

        respond(true, {
          runId: result.runId,
          response: result.response,
          tokensUsed: result.tokensUsed,
          toolsUsed: result.toolsUsed,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Agent execution failed";
        
        // Check if it's an LLM provider error
        if (errorMessage.includes("API key") || errorMessage.includes("No LLM provider")) {
          respond(false, undefined, {
            code: "LLM_CONFIG_ERROR",
            message: `${errorMessage}. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.`,
          });
        } else {
          respond(false, undefined, {
            code: "AGENT_ERROR",
            message: errorMessage,
          });
        }
      }
    },

    "agent.prompts": async ({ respond, params }) => {
      const agentId = (params?.agentId as string | undefined) || null;

      if (!agentId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing agentId",
        });
        return;
      }

      try {
        const runtime = await agentFactory.getRuntime(agentId);
        if (!runtime || !runtime.loadPrompts) {
          respond(false, undefined, {
            code: "AGENT_NOT_FOUND",
            message: `Agent "${agentId}" not found or doesn't support prompt loading`,
          });
          return;
        }

        const prompts = await runtime.loadPrompts();
        const promptsData = prompts as {
          system?: string;
          behavior?: string;
          personality?: string;
          instructions?: string;
          files?: Map<string, string>;
        };

        respond(true, {
          agentId,
          system: promptsData.system,
          behavior: promptsData.behavior,
          personality: promptsData.personality,
          instructions: promptsData.instructions,
          fileCount: promptsData.files?.size ?? 0,
        });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to load prompts",
        });
      }
    },
  };
}
