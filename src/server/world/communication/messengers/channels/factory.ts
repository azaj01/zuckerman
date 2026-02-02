import { ChannelRegistry } from "./registry.js";
import { WhatsAppChannel } from "./whatsapp.js";
import { TelegramChannel } from "./telegram.js";
import { DiscordChannel } from "./discord.js";
import { SignalChannel } from "./signal.js";
import { SlackChannel } from "./slack.js";
import { WebChatChannel } from "./webchat.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";
import type { SimpleRouter } from "@server/world/communication/routing/index.js";
import type { SessionManager } from "@server/agents/zuckerman/sessions/index.js";
import type { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import type { Channel } from "./types.js";
import { setChannelRegistry } from "@server/agents/zuckerman/tools/channels/registry.js";

/**
 * Initialize and register all configured channels
 */
export async function initializeChannels(
  config: ZuckermanConfig,
  router: SimpleRouter,
  sessionManager: SessionManager, // Kept for backward compatibility, but will use factory
  agentFactory: AgentRuntimeFactory,
  broadcastEvent?: (event: { type: "event"; event: string; payload?: unknown }) => void,
): Promise<ChannelRegistry> {
  const registry = new ChannelRegistry();

  // Initialize WhatsApp if enabled
  if (config.channels?.whatsapp?.enabled) {
    const whatsappChannel = new WhatsAppChannel(
      config.channels.whatsapp,
      (qr) => {
        // Broadcast QR code to all connected gateway clients
        // Empty string means QR was cleared
        if (broadcastEvent) {
          if (qr && qr.length > 0) {
            broadcastEvent({
              type: "event",
              event: "channel.whatsapp.qr",
              payload: { qr, channelId: "whatsapp", ts: Date.now() },
            });
          } else {
            // Broadcast QR cleared event
            broadcastEvent({
              type: "event",
              event: "channel.whatsapp.qr",
              payload: { qr: null, channelId: "whatsapp", cleared: true, ts: Date.now() },
            });
          }
        }
      },
      (connected) => {
        // Broadcast connection status to all connected gateway clients
        // Only broadcast if status actually changed
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.whatsapp.connection",
            payload: { connected, channelId: "whatsapp", ts: Date.now() },
          });
        }
      },
    );

    // Set up message handler to route to agents
    whatsappChannel.onMessage(async (message) => {
      try {
        // Route message to agent
        const route = await router.routeToAgent(message, {
          accountId: "default",
        });

        // Get agent runtime
        const runtime = await agentFactory.getRuntime(route.agentId);
        if (!runtime) {
          console.error(`[Channels] Agent "${route.agentId}" not found for message`);
          return;
        }

        // Get session manager for this agent
        const sm = agentFactory.getSessionManager(route.agentId);
        
        // Get or create session
        let session = sm.getSession(route.sessionId);
        if (!session) {
          const newSession = sm.createSession(
            route.sessionKey,
            message.metadata?.isGroup ? "group" : "main",
            route.agentId,
          );
          session = sm.getSession(newSession.id)!;
        }

        // Store channel metadata for tool access
        await sm.updateChannelMetadata(route.sessionId, {
          channel: channelId,
          to: message.from,
          accountId: "default",
        });

        // Add message to session
        sm.addMessage(route.sessionId, "user", message.content);

        // Run agent
        const config = await import("@server/world/config/index.js").then(m => m.loadConfig());
        const { resolveSecurityContext } = await import("@server/world/execution/security/context/index.js");
        const securityContext = await resolveSecurityContext(
          config.security,
          route.sessionId,
          session.session.type,
          route.agentId,
          route.landDir,
        );

        const result = await runtime.run({
          sessionId: route.sessionId,
          message: message.content,
          securityContext,
        });

        // Add assistant response (reuse sm from above)
        sm.addMessage(route.sessionId, "assistant", result.response);

        // Send reply back through channel
        await whatsappChannel.send(result.response, message.from);
      } catch (error) {
        console.error("[Channels] Error processing message:", error);
      }
    });

    registry.register(whatsappChannel, {
      id: "whatsapp",
      type: "whatsapp",
      enabled: config.channels.whatsapp.enabled,
      config: config.channels.whatsapp as Record<string, unknown>,
    });

    // Set channel registry for agent tools
    setChannelRegistry(registry);
  }

  // Helper function to set up message routing for a channel
  const setupChannelRouting = async (
    channel: Channel,
    channelId: string,
    channelType: string,
  ) => {
    channel.onMessage(async (message) => {
      try {
        // Route message to agent
        const route = await router.routeToAgent(message, {
          accountId: "default",
        });

        // Get agent runtime
        const runtime = await agentFactory.getRuntime(route.agentId);
        if (!runtime) {
          console.error(`[Channels] Agent "${route.agentId}" not found for message`);
          return;
        }

        // Get session manager for this agent
        const sm = agentFactory.getSessionManager(route.agentId);
        
        // Get or create session
        let session = sm.getSession(route.sessionId);
        if (!session) {
          const newSession = sm.createSession(
            route.sessionKey,
            message.metadata?.isGroup ? "group" : "main",
            route.agentId,
          );
          session = sm.getSession(newSession.id)!;
        }

        // Store channel metadata for tool access
        await sm.updateChannelMetadata(route.sessionId, {
          channel: channelId,
          to: message.from,
          accountId: "default",
        });

        // Add message to session
        sm.addMessage(route.sessionId, "user", message.content);

        // Run agent
        const config = await import("@server/world/config/index.js").then(m => m.loadConfig());
        const { resolveSecurityContext } = await import("@server/world/execution/security/context/index.js");
        const securityContext = await resolveSecurityContext(
          config.security,
          route.sessionId,
          session.session.type,
          route.agentId,
          route.landDir,
        );

        const result = await runtime.run({
          sessionId: route.sessionId,
          message: message.content,
          securityContext,
        });

        // Add assistant response (reuse sm from above)
        sm.addMessage(route.sessionId, "assistant", result.response);

        // Send reply back through channel
        await channel.send(result.response, message.from);
      } catch (error) {
        console.error("[Channels] Error processing message:", error);
      }
    });
  };

  // Initialize Telegram if enabled
  if (config.channels?.telegram?.enabled) {
    const telegramChannel = new TelegramChannel(
      config.channels.telegram,
      (connected) => {
        // Broadcast connection status to all connected gateway clients
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.telegram.connection",
            payload: { connected, channelId: "telegram", ts: Date.now() },
          });
        }
      },
    );
    await setupChannelRouting(telegramChannel, "telegram", "telegram");
    
    registry.register(telegramChannel, {
      id: "telegram",
      type: "telegram",
      enabled: config.channels.telegram.enabled,
      config: config.channels.telegram as Record<string, unknown>,
    });
    
    // Start channel (will be started by registry.startAll() but can start here if needed)
  }

  // Initialize Discord if enabled
  if (config.channels?.discord?.enabled) {
    const discordChannel = new DiscordChannel(
      config.channels.discord,
      (connected) => {
        // Broadcast connection status to all connected gateway clients
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.discord.connection",
            payload: { connected, channelId: "discord", ts: Date.now() },
          });
        }
      },
    );
    await setupChannelRouting(discordChannel, "discord", "discord");
    
    registry.register(discordChannel, {
      id: "discord",
      type: "discord",
      enabled: config.channels.discord.enabled,
      config: config.channels.discord as Record<string, unknown>,
    });
  }

  // Initialize Signal if enabled
  if (config.channels?.signal?.enabled) {
    const signalChannel = new SignalChannel(
      config.channels.signal,
      (connected) => {
        // Broadcast connection status to all connected gateway clients
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.signal.connection",
            payload: { connected, channelId: "signal", ts: Date.now() },
          });
        }
      },
    );
    await setupChannelRouting(signalChannel, "signal", "signal");
    
    registry.register(signalChannel, {
      id: "signal",
      type: "signal",
      enabled: config.channels.signal.enabled,
      config: config.channels.signal as Record<string, unknown>,
    });
  }

  // Initialize Slack if enabled
  if (config.channels?.slack?.enabled) {
    const slackChannel = new SlackChannel(config.channels.slack);
    await setupChannelRouting(slackChannel, "slack", "slack");
    
    registry.register(slackChannel, {
      id: "slack",
      type: "slack",
      enabled: config.channels.slack.enabled,
      config: config.channels.slack as Record<string, unknown>,
    });
  }

  // Initialize WebChat if enabled
  if (config.channels?.webchat?.enabled) {
    const webchatChannel = new WebChatChannel(config.channels.webchat);
    await setupChannelRouting(webchatChannel, "webchat", "webchat");
    
    registry.register(webchatChannel, {
      id: "webchat",
      type: "webchat",
      enabled: config.channels.webchat.enabled,
      config: config.channels.webchat as Record<string, unknown>,
    });
  }

  // Set channel registry for agent tools (even if no channels registered)
  setChannelRegistry(registry);

  return registry;
}
