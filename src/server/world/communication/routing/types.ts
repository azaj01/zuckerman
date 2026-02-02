import type { ChannelId, ChannelMessage } from "@server/world/communication/messengers/channels/types.js";
import type { ConversationId } from "@server/agents/zuckerman/conversations/types.js";

export interface Route {
  channelId: ChannelId;
  conversationId: ConversationId;
  condition?: (message: ChannelMessage) => boolean;
}

export interface Router {
  route(message: ChannelMessage): Promise<ConversationId | null>;
  addRoute(route: Route): void;
  removeRoute(channelId: ChannelId): void;
}
