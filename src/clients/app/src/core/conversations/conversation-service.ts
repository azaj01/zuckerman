import type { GatewayClient } from "../core/gateway/client";
import type { Conversation, ConversationState, ConversationType } from "../types/conversation";

/**
 * Conversation service - handles all conversation-related operations
 */
export class ConversationService {
  constructor(private client: GatewayClient) {}

  async listConversations(): Promise<Conversation[]> {
    const response = await this.client.request("conversations.list");
    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to list conversations");
    }

    const result = response.result as { conversations?: Array<{
      id: string;
      label: string;
      type: string;
      agentId?: string;
      lastActivity?: number;
    }> };

    return (result.conversations || []).map((conversation) => ({
      id: conversation.id,
      label: conversation.label || conversation.id,
      type: (conversation.type || "main") as ConversationType,
      agentId: conversation.agentId,
      lastActivity: conversation.lastActivity,
    }));
  }

  async getConversation(id: string): Promise<ConversationState> {
    const response = await this.client.request("conversations.get", { id });
    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to get conversation");
    }

    // Response structure is { conversation: ConversationState }
    const result = response.result as { conversation: ConversationState };
    return result.conversation;
  }

  async createConversation(
    type: ConversationType,
    agentId: string,
    label?: string
  ): Promise<Conversation> {
    const response = await this.client.request("conversations.create", {
      type,
      agentId,
      label: label || `conversation-${Date.now()}`,
    });

    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to create conversation");
    }

    const result = response.result as {
      conversation: {
        id: string;
        label: string;
        type: string;
        agentId?: string;
      };
    };

    return {
      id: result.conversation.id,
      label: result.conversation.label,
      type: result.conversation.type as ConversationType,
      agentId: result.conversation.agentId,
    };
  }

  async deleteConversation(id: string): Promise<void> {
    const response = await this.client.request("conversations.delete", { id });
    if (!response.ok) {
      throw new Error(response.error?.message || "Failed to delete conversation");
    }
  }
}
