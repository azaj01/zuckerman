import type { GatewayClient } from "../gateway/client";
import type { TelegramConfig, ChannelConnectionState, ChannelStatus } from "./types";

/**
 * Telegram Channel Service - handles Telegram channel connection and configuration
 */
export class TelegramChannelService {
  private eventListeners: {
    status?: (status: { status: "connected" | "connecting" | "disconnected" }) => void;
    error?: (error: string) => void;
  } = {};

  constructor(private client: GatewayClient) {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for Telegram-specific events
   */
  private setupEventListeners(): void {
    const handleStatusEvent = (e: CustomEvent<{
      status: "connected" | "connecting" | "disconnected";
      channelId: string;
    }>) => {
      if (e.detail.channelId === "telegram") {
        this.eventListeners.status?.({
          status: e.detail.status,
        });
      }
    };

    window.addEventListener("telegram-status", handleStatusEvent as EventListener);

    // Store cleanup function
    this.cleanup = () => {
      window.removeEventListener("telegram-status", handleStatusEvent as EventListener);
    };
  }

  private cleanup?: () => void;

  /**
   * Register event listeners
   */
  on<K extends keyof { status: (status: { status: "connected" | "connecting" | "disconnected" }) => void; error: (error: string) => void }>(
    event: K,
    handler: { status: (status: { status: "connected" | "connecting" | "disconnected" }) => void; error: (error: string) => void }[K]
  ): void {
    this.eventListeners[event] = handler;
  }

  /**
   * Remove event listeners
   */
  off(event: keyof typeof this.eventListeners): void {
    delete this.eventListeners[event];
  }

  /**
   * Cleanup all listeners
   */
  destroy(): void {
    this.cleanup?.();
    this.eventListeners = {};
  }

  /**
   * Load Telegram configuration from gateway
   */
  async loadConfig(): Promise<TelegramConfig> {
    const configResponse = await this.client.request("config.get", {}) as {
      ok: boolean;
      result?: { config?: { channels?: { telegram?: TelegramConfig } } };
    };

    if (!configResponse.ok || !configResponse.result?.config?.channels?.telegram) {
      return {
        dmPolicy: "pairing",
        allowFrom: [],
      };
    }

    return {
      botToken: configResponse.result.config.channels.telegram.botToken,
      dmPolicy: configResponse.result.config.channels.telegram.dmPolicy || "pairing",
      allowFrom: configResponse.result.config.channels.telegram.allowFrom || [],
    };
  }

  /**
   * Save Telegram configuration
   */
  async saveConfig(config: TelegramConfig): Promise<void> {
    const configResponse = await this.client.request("config.update", {
      updates: {
        channels: {
          telegram: config,
        },
      },
    }) as { ok: boolean; error?: { message: string } };

    if (!configResponse.ok) {
      throw new Error(configResponse.error?.message || "Failed to update config");
    }

    // Reload channels if connected to apply config changes
    const status = await this.getStatus();
    if (status?.connected) {
      await this.client.request("channels.reload", {});
    }
  }

  /**
   * Get current connection status
   */
  async getStatus(): Promise<ChannelStatus | null> {
    const statusResponse = await this.client.request("channels.status", {}) as {
      ok: boolean;
      result?: { status?: ChannelStatus[] };
    };

    if (!statusResponse.ok || !statusResponse.result?.status) {
      return null;
    }

    return statusResponse.result.status.find((s) => s.id === "telegram") || null;
  }

  /**
   * Connect Telegram channel
   */
  async connect(botToken: string, config?: Partial<TelegramConfig>): Promise<void> {
    if (!botToken.trim()) {
      const error = "Bot token is required";
      this.eventListeners.error?.(error);
      throw new Error(error);
    }

    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    // Load existing config or use provided/default
    const currentConfig = await this.loadConfig();

    // Enable Telegram in config with bot token
    const configResponse = await this.client.request("config.update", {
      updates: {
        channels: {
          telegram: {
            enabled: true,
            botToken: botToken.trim(),
            dmPolicy: config?.dmPolicy || currentConfig.dmPolicy || "pairing",
            allowFrom: config?.allowFrom || currentConfig.allowFrom || [],
          },
        },
      },
    }) as { ok: boolean; error?: { message: string } };

    if (!configResponse.ok) {
      const error = configResponse.error?.message || "Failed to update config";
      this.eventListeners.error?.(error);
      throw new Error(error);
    }

    // Reload channels to pick up the new config
    const reloadResponse = await this.client.request("channels.reload", {}) as {
      ok: boolean;
      error?: { message: string };
    };

    if (!reloadResponse.ok) {
      const error = reloadResponse.error?.message || "Failed to reload channels";
      this.eventListeners.error?.(error);
      throw new Error(error);
    }

    // Start Telegram channel
    const startResponse = await this.client.request("channels.start", {
      channelId: "telegram",
    }) as { ok: boolean; error?: { message: string } };

    if (!startResponse.ok) {
      const error = startResponse.error?.message || "Failed to start Telegram";
      this.eventListeners.error?.(error);
      throw new Error(error);
    }

    // Poll for connection status (Telegram connects quickly)
    let attempts = 0;
    const maxAttempts = 10;
    const pollConnection = async (): Promise<void> => {
      try {
        const status = await this.getStatus();
        if (status?.connected) {
          this.eventListeners.status?.({ status: "connected" });
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(pollConnection, 500);
        } else {
          const error = "Telegram connection timeout. Please check your bot token.";
          this.eventListeners.error?.(error);
          throw new Error(error);
        }
      } catch (err: any) {
        const error = err.message || "Failed to verify Telegram connection";
        this.eventListeners.error?.(error);
        throw new Error(error);
      }
    };

    // Initial check
    const status = await this.getStatus();
    if (status?.connected) {
      this.eventListeners.status?.({ status: "connected" });
      return;
    }

    // Start polling
    setTimeout(pollConnection, 500);
  }

  /**
   * Disconnect Telegram channel
   */
  async disconnect(): Promise<void> {
    const stopResponse = await this.client.request("channels.stop", {
      channelId: "telegram",
    }) as { ok: boolean; error?: { message: string } };

    if (!stopResponse.ok) {
      throw new Error(stopResponse.error?.message || "Failed to stop Telegram");
    }

    this.eventListeners.status?.({ status: "disconnected" });
  }
}
