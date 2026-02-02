import { Client, GatewayIntentBits, Events, Message, TextChannel, DMChannel } from "discord.js";
import type { Channel, ChannelMessage } from "./types.js";
import type { DiscordConfig } from "@server/world/config/types.js";

enum ChannelState {
  IDLE = "idle",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  STOPPING = "stopping",
}

export class DiscordChannel implements Channel {
  id: string = "discord";
  type = "discord" as const;
  private client: Client | null = null;
  private config: DiscordConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private state: ChannelState = ChannelState.IDLE;
  private statusCallback?: (status: {
    status: "connected" | "connecting" | "disconnected";
  }) => void;

  constructor(config: DiscordConfig, statusCallback?: (status: {
    status: "connected" | "connecting" | "disconnected";
  }) => void) {
    this.config = config;
    this.statusCallback = statusCallback;
  }

  async start(): Promise<void> {
    if (this.state === ChannelState.CONNECTED) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[Discord] Channel is disabled in config");
      this.state = ChannelState.IDLE;
      return;
    }

    if (!this.config.token) {
      console.error("[Discord] Bot token is required");
      this.state = ChannelState.IDLE;
      return;
    }

    // Don't start if stopping
    if (this.state === ChannelState.STOPPING) {
      return;
    }

    this.state = ChannelState.CONNECTING;
    this.notifyStatus("connecting");

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      });

      // Handle ready event
      this.client.once(Events.ClientReady, () => {
        console.log(`[Discord] Bot logged in as ${this.client!.user!.tag}`);
        this.state = ChannelState.CONNECTED;
        this.notifyStatus("connected");
      });

      // Handle incoming messages
      this.client.on(Events.MessageCreate, async (message: Message) => {
        await this.handleIncomingMessage(message);
      });

      // Login
      await this.client.login(this.config.token);
    } catch (error) {
      console.error("[Discord] Failed to start:", error);
      this.state = ChannelState.IDLE;
      this.notifyStatus("disconnected");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state === ChannelState.STOPPING || this.state === ChannelState.IDLE) {
      return;
    }

    this.state = ChannelState.STOPPING;

    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }

    this.state = ChannelState.IDLE;
    this.notifyStatus("disconnected");
  }

  async send(message: string, to: string): Promise<void> {
    if (this.state !== ChannelState.CONNECTED || !this.client) {
      throw new Error("Discord channel is not connected");
    }

    try {
      // Parse channel ID (could be channel ID or user ID for DMs)
      const channel = await this.client.channels.fetch(to);
      if (channel && (channel instanceof TextChannel || channel instanceof DMChannel)) {
        await channel.send(message);
      } else {
        throw new Error(`Channel ${to} not found or not a text channel`);
      }
    } catch (error) {
      console.error(`[Discord] Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) {
      return;
    }

    // Ignore messages without content
    if (!message.content) {
      return;
    }

    const channel = message.channel;
    const isDM = channel instanceof DMChannel;
    const isGroup = channel instanceof TextChannel;

    // Check DM policy
    if (isDM && this.config.dm) {
      if (!this.config.dm.enabled) {
        return;
      }

      if (this.config.dm.policy === "allowlist" && this.config.dm.allowFrom) {
        const userId = message.author.id;
        const isAllowed = this.config.dm.allowFrom.includes("*") || 
                         this.config.dm.allowFrom.includes(userId);
        
        if (!isAllowed) {
          console.log(`[Discord] Message from ${userId} blocked (not in allowlist)`);
          return;
        }
      }
    }

    // Check guild/channel allowlist for group messages
    if (isGroup && message.guild) {
      const guildId = message.guild.id;
      const channelId = channel.id;
      const guildConfig = this.config.guilds?.[guildId];
      
      if (guildConfig) {
        const channelConfig = guildConfig.channels?.[channelId];
        if (channelConfig?.allow === false) {
          console.log(`[Discord] Message from channel ${channelId} blocked`);
          return;
        }

        // Check mention requirement
        if (guildConfig.requireMention || channelConfig?.requireMention) {
          if (!message.mentions.has(this.client!.user!.id)) {
            // Store for context but don't trigger reply
            return;
          }
        }
      }
    }

    const channelMessage: ChannelMessage = {
      id: message.id,
      channelId: this.id,
      from: channel.id,
      content: message.content,
      timestamp: message.createdTimestamp,
      metadata: {
        peerId: channel.id,
        peerKind: isDM ? "dm" : "channel",
        messageId: message.id,
        isGroup,
        fromId: message.author.id,
        fromUsername: message.author.username,
        guildId: message.guild?.id,
        guildName: message.guild?.name,
        channelName: isGroup ? (channel as TextChannel).name : undefined,
      },
    };

    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(channelMessage);
      } catch (error) {
        console.error("[Discord] Error in message handler:", error);
      }
    }
  }

  isConnected(): boolean {
    return this.state === ChannelState.CONNECTED && this.client !== null;
  }

  private notifyStatus(status: "connected" | "connecting" | "disconnected"): void {
    if (this.statusCallback) {
      this.statusCallback({ status });
    }
  }
}
