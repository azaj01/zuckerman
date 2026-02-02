import type { GatewayRequestHandlers } from "../types.js";
import type { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import { loadConfig } from "@server/world/config/index.js";

/**
 * Find conversation across all agents' ConversationManagers
 */
async function findConversationAcrossAgents(
  agentFactory: AgentRuntimeFactory,
  conversationId: string
): Promise<{ conversationManager: any; state: any } | null> {
  const config = await loadConfig();
  const agentIds = config.agents?.list?.map((a) => a.id) || ["zuckerman"];

  for (const agentId of agentIds) {
    const conversationManager = agentFactory.getConversationManager(agentId);
    const state = conversationManager.getConversation(conversationId);
    if (state) {
      return { conversationManager, state };
    }
  }

  return null;
}

/**
 * List all conversations across all agents
 */
async function listAllConversations(agentFactory: AgentRuntimeFactory): Promise<any[]> {
  const config = await loadConfig();
  const agentIds = config.agents?.list?.map((a) => a.id) || ["zuckerman"];
  const allConversations: any[] = [];

  for (const agentId of agentIds) {
    const conversationManager = agentFactory.getConversationManager(agentId);
    const conversations = conversationManager.listConversations();
    allConversations.push(...conversations);
  }

  return allConversations;
}

export function createConversationHandlers(agentFactory: AgentRuntimeFactory): Partial<GatewayRequestHandlers> {
  return {
    "conversations.create": async ({ respond, params }) => {
      const label = params?.label as string | undefined;
      const type = (params?.type as string | undefined) || "main";
      const agentId = (params?.agentId as string | undefined) || "zuckerman";

      const conversationManager = agentFactory.getConversationManager(agentId);
      const conversation = conversationManager.createConversation(
        label || `conversation-${Date.now()}`,
        type as "main" | "group" | "channel",
        agentId,
      );

      respond(true, { conversation });
    },

    "conversations.list": async ({ respond }) => {
      const conversations = await listAllConversations(agentFactory);
      respond(true, { conversations });
    },

    "conversations.get": async ({ respond, params }) => {
      const id = params?.id as string | undefined;
      if (!id) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing conversation id",
        });
        return;
      }

      const result = await findConversationAcrossAgents(agentFactory, id);
      if (!result) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Conversation ${id} not found`,
        });
        return;
      }

      respond(true, { conversation: result.state });
    },

    "conversations.delete": async ({ respond, params }) => {
      const id = params?.id as string | undefined;
      if (!id) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing conversation id",
        });
        return;
      }

      const result = await findConversationAcrossAgents(agentFactory, id);
      if (!result) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Conversation ${id} not found`,
        });
        return;
      }

      const deleted = result.conversationManager.deleteConversation(id);
      if (!deleted) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Conversation ${id} not found`,
        });
        return;
      }

      respond(true, { deleted: true });
    },
  };
}
