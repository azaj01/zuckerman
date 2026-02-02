import type { GatewayClient } from "../gateway/client";
import type { Conversation } from "./conversation";

export interface AppState {
  currentConversationId: string | null;
  currentAgentId: string | null;
  conversations: Conversation[];
  agents: string[];
  connectionStatus: "connected" | "disconnected" | "connecting";
  gatewayClient: GatewayClient | null;
}
