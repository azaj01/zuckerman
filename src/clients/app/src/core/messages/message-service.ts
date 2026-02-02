import type { GatewayClient } from "../core/gateway/client";
import type { Message, BackendMessage } from "../types/message";
import { SessionService } from "../sessions/session-service";

/**
 * Message service - handles message operations including deduplication
 */
export class MessageService {
  private sessionService: SessionService;

  constructor(
    private client: GatewayClient,
    sessionService?: SessionService
  ) {
    // Allow dependency injection, fallback to creating new instance
    this.sessionService = sessionService || new SessionService(client);
  }

  /**
   * Load messages from a session
   */
  async loadMessages(sessionId: string): Promise<Message[]> {
    const sessionState = await this.sessionService.getSession(sessionId);
    const backendMessages = sessionState.messages || [];

    const transformed = this.transformMessages(backendMessages);

    return transformed;
  }

  /**
   * Transform backend messages to UI messages
   */
  transformMessages(backendMessages: BackendMessage[]): Message[] {
    return backendMessages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      rawResponse: undefined,
    }));
  }

  /**
   * Deduplicate messages by content + role + approximate timestamp
   */
  deduplicateMessages(messages: Message[]): Message[] {
    const deduplicated: Message[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      const timeKey = Math.floor((msg.timestamp || 0) / 1000);
      const key = `${msg.role}:${msg.content}:${timeKey}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(msg);
      }
    }

    return deduplicated;
  }

  /**
   * Send a message via agent.run
   */
  async sendMessage(
    sessionId: string,
    agentId: string,
    message: string
  ): Promise<unknown> {
    console.log(`[MessageService] Sending message to agent "${agentId}" in session "${sessionId}"`);
    
    const response = await this.client.request("agent.run", {
      sessionId,
      agentId,
      message,
    });

    if (!response.ok) {
      const errorMessage = response.error?.message || "Failed to run agent";
      const errorCode = response.error?.code || "UNKNOWN_ERROR";
      console.error(`[MessageService] Agent run failed:`, {
        code: errorCode,
        message: errorMessage,
        agentId,
        sessionId,
      });
      throw new Error(errorMessage);
    }

    if (!response.result) {
      console.error(`[MessageService] Agent run returned no result:`, {
        agentId,
        sessionId,
        response,
      });
      throw new Error("Agent run returned no result");
    }

    return response.result;
  }
}
