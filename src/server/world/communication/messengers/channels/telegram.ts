import { Bot, Context } from "grammy";
import type { Channel, ChannelMessage } from "./types.js";
import type { TelegramConfig } from "@server/world/config/types.js";

export class TelegramChannel implements Channel {
  id: string = "telegram";
  type = "telegram" as const;
  private bot: Bot | null = null;
  private config: TelegramConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private isRunning = false;
  private connectionCallback?: (connected: boolean) => void;

  constructor(config: TelegramConfig, connectionCallback?: (connected: boolean) => void) {
    this.config = config;
    this.connectionCallback = connectionCallback;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[Telegram] Channel is disabled in config");
      return;
    }

    if (!this.config.botToken) {
      console.error("[Telegram] Bot token is required");
      return;
    }

    try {
      this.bot = new Bot(this.config.botToken);

      // Verify bot token and check for conflicts BEFORE starting
      try {
        await this.bot.api.getMe();
      } catch (verifyError: any) {
        // If we get a 409 conflict, another instance is running
        if (verifyError?.error_code === 409 || 
            (verifyError?.description && verifyError.description.includes("terminated by other getUpdates request"))) {
          console.error("[Telegram] Cannot start: Another bot instance is already running with this token. Only one instance can run at a time. Please stop the other instance first.");
          this.bot = null;
          this.isRunning = false;
          if (this.connectionCallback) {
            this.connectionCallback(false);
          }
          return;
        }
        // For other errors (like invalid token), throw
        throw verifyError;
      }

      // Handle incoming messages
      this.bot.on("message:text", async (ctx: Context) => {
        await this.handleIncomingMessage(ctx);
      });

      // Handle edited messages
      this.bot.on("edited_message:text", async (ctx: Context) => {
        await this.handleIncomingMessage(ctx);
      });

      // Add error handler
      this.bot.catch((err) => {
        console.error("[Telegram] Error in bot handler:", err);
      });

      // Start bot - bot.start() doesn't resolve, it runs indefinitely
      // So we start it without awaiting and mark as running immediately
      this.bot.start().catch((err) => {
        console.error("[Telegram] Bot start error:", err);
        this.isRunning = false;
        if (this.connectionCallback) {
          this.connectionCallback(false);
        }
      });
      
      // Mark as running immediately after starting (bot.start() doesn't resolve)
      this.isRunning = true;
      console.log("[Telegram] Bot started successfully");
      
      // Broadcast connection status
      if (this.connectionCallback) {
        this.connectionCallback(true);
      }
    } catch (error: any) {
      console.error("[Telegram] Failed to start:", error);
      this.bot = null;
      this.isRunning = false;
      // Broadcast disconnected status
      if (this.connectionCallback) {
        this.connectionCallback(false);
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
    this.isRunning = false;
    // Broadcast disconnected status
    if (this.connectionCallback) {
      this.connectionCallback(false);
    }
  }

  async send(message: string, to: string): Promise<void> {
    if (!this.bot || !this.isRunning) {
      throw new Error("Telegram channel is not connected");
    }

    try {
      await this.bot.api.sendMessage(Number(to), message);
    } catch (error) {
      console.error(`[Telegram] Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private async handleIncomingMessage(ctx: Context): Promise<void> {
    const message = ctx.message;
    if (!message || !message.text) {
      return;
    }

    const chat = message.chat;
    const fromId = message.from?.id.toString() || "";
    const chatId = chat.id.toString();
    const isGroup = chat.type === "group" || chat.type === "supergroup";

    // Check allowlist for DMs
    if (!isGroup && this.config.dmPolicy === "allowlist" && this.config.allowFrom) {
      const isAllowed = this.config.allowFrom.includes("*") || 
                       this.config.allowFrom.includes(fromId);
      
      if (!isAllowed) {
        console.log(`[Telegram] Message from ${fromId} blocked (not in allowlist)`);
        return;
      }
    }

    // Check group policy
    if (isGroup && this.config.groupPolicy === "allowlist") {
      // For groups, check if group is in allowlist (if groups config exists)
      const groupConfig = this.config.groups?.[chatId];
      if (!groupConfig && !this.config.groups?.["*"]) {
        console.log(`[Telegram] Message from group ${chatId} blocked (not in allowlist)`);
        return;
      }
    }

    // Check mention requirement for groups
    if (isGroup && message.text) {
      const groupConfig = this.config.groups?.[chatId] || this.config.groups?.["*"];
      if (groupConfig?.requireMention) {
        // Check if bot was mentioned
        const botInfo = await this.bot!.api.getMe();
        const mentioned = message.entities?.some(
          (entity) => entity.type === "mention" && 
                     message.text!.substring(entity.offset, entity.offset + entity.length) === `@${botInfo.username}`
        ) || message.text.includes(`@${botInfo.username}`);
        
        if (!mentioned) {
          // Store for context but don't trigger reply
          return;
        }
      }
    }

    const channelMessage: ChannelMessage = {
      id: message.message_id.toString(),
      channelId: this.id,
      from: chatId,
      content: message.text,
      timestamp: message.date * 1000,
      metadata: {
        peerId: chatId,
        peerKind: isGroup ? "group" : "dm",
        messageId: message.message_id,
        isGroup,
        fromId,
        fromUsername: message.from?.username,
        chatTitle: isGroup ? chat.title : undefined,
      },
    };

    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(channelMessage);
      } catch (error) {
        console.error("[Telegram] Error in message handler:", error);
      }
    }
  }

  isConnected(): boolean {
    return this.isRunning && this.bot !== null;
  }
}
