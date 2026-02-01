import type { ChannelId, ChannelMessage } from "@server/world/communication/messengers/channels/types.js";
import type { SessionId } from "@server/agents/zuckerman/sessions/types.js";

export interface Route {
  channelId: ChannelId;
  sessionId: SessionId;
  condition?: (message: ChannelMessage) => boolean;
}

export interface Router {
  route(message: ChannelMessage): Promise<SessionId | null>;
  addRoute(route: Route): void;
  removeRoute(channelId: ChannelId): void;
}
