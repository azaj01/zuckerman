export type ConversationType = "main" | "group" | "channel";

export interface Conversation {
  id: string;
  label: string;
  type: ConversationType;
  agentId?: string;
  lastActivity?: number;
}

export interface ConversationState {
  conversation?: Conversation;
  messages?: Array<{
    role: string;
    content: string;
    timestamp?: number;
    toolCallId?: string;
    toolCalls?: unknown[];
  }>;
}
