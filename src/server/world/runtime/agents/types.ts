import type { ConversationId, ConversationState, Conversation, ConversationKey, ConversationType, ConversationLabel } from "@server/agents/zuckerman/conversations/types.js";
import type { SecurityContext } from "@server/world/execution/security/types.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AgentRunParams {
  runId?: string;
  conversationId: ConversationId;
  message: string;
  /**
   * Channel metadata for tool access (optional, set by world when routing from channels)
   */
  channelMetadata?: {
    channel?: string;
    to?: string;
    accountId?: string;
  };
  /**
   * Conversation context for memory (optional, extracted from conversation messages)
   */
  conversationContext?: string;
  /**
   * Conversation messages (optional, provided by agent service)
   */
  conversationMessages?: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: number;
    toolCallId?: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;
    }>;
  }>;
}

export interface AgentRunResult {
  response: string;
  runId: string;
  tokensUsed?: number;
  toolsUsed?: string[];
}

/**
 * Agent runtime interface - all agent runtimes must implement this
 * Includes conversation management methods for world code to use
 */
export interface AgentRuntime {
  /**
   * Agent identifier
   */
  readonly agentId: string;

  /**
   * Initialize the agent (called once when agent is created)
   */
  initialize?(): Promise<void>;

  /**
   * Run the agent with given parameters
   */
  run(params: AgentRunParams): Promise<AgentRunResult>;

  /**
   * Load agent prompts (for inspection/debugging)
   */
  loadPrompts?(): Promise<unknown>;

  /**
   * Clear caches (for hot reload)
   */
  clearCache?(): void;

  /**
   * Get conversation by ID (read-only)
   */
  getConversation?(conversationId: ConversationId): ConversationState | undefined;

  /**
   * List all conversations (read-only)
   */
  listConversations?(): Conversation[];

  /**
   * Create a new conversation (for routing/setup)
   */
  createConversation?(
    label: string,
    type?: "main" | "group" | "channel",
    agentId?: string
  ): Conversation;

  /**
   * Delete a conversation (for API operations)
   */
  deleteConversation?(conversationId: ConversationId): boolean;

  /**
   * Get or create main conversation (for routing)
   */
  getOrCreateMainConversation?(agentId?: string): Conversation;

  /**
   * Get or create conversation by key (for routing from world)
   */
  getOrCreateConversationByKey?(
    conversationKey: ConversationKey,
    type: ConversationType,
    label?: ConversationLabel,
  ): Conversation;
}
