import type { GatewayClient } from "../gateway/client";
import type { DiscordConfig, ChannelConnectionState, ChannelStatus } from "./types";

/**
 * Discord Channel Service - handles Discord channel connection and configuration
 */
export class DiscordChannelService {
  private eventListeners: {
    status?: (status: { status: "connected" | "connecting" | "disconnected" }) => void;
    error?: (error: string) => void;
  } = {};

  constructor(private client: GatewayClient) {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for Discord-specific events
   */
  private setupEventListeners(): void {
    const handleStatusEvent = (e: CustomEvent<{
      status: "connected" | "connecting" | "disconnected";
      channelId: string;
    }>) => {
      if (e.detail.channelId === "discord") {
        this.eventListeners.status?.({
          status: e.detail.status,
        });
      }
    };

    window.addEventListener("discord-status", handleStatusEvent as EventListener);

    // Store cleanup function
    this.cleanup = () => {
      window.removeEventListener("discord-status", handleStatusEvent as EventListener);
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
   * Load Discord configuration from gateway
   */
  async loadConfig(): Promise<DiscordConfig> {
    const configResponse = await this.client.request("config.get", {}) as {
      ok: boolean;
      result?: { config?: { channels?: { discord?: DiscordConfig } } };
    };

    if (!configResponse.ok || !configResponse.result?.config?.channels?.discord) {
      return {
        dm: {
          enabled: true,
          policy: "pairing",
          allowFrom: [],
        },
      };
    }

    return {
      token: configResponse.result.config.channels.discord.token,
      dm: configResponse.result.config.channels.discord.dm || {
        enabled: true,
        policy: "pairing",
        allowFrom: [],
      },
      guilds: configResponse.result.config.channels.discord.guilds,
    };
  }

  /**
   * Save Discord configuration
   */
  async saveConfig(config: DiscordConfig): Promise<void> {
    const configResponse = await this.client.request("config.update", {
      updates: {
        channels: {
          discord: config,
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

    return statusResponse.result.status.find((s) => s.id === "discord") || null;
  }

  /**
   * Connect Discord channel
   */
  async connect(botToken: string, config?: Partial<DiscordConfig>): Promise<void> {
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

    // Enable Discord in config with bot token
    const configResponse = await this.client.request("config.update", {
      updates: {
        channels: {
          discord: {
            enabled: true,
            token: botToken.trim(),
            dm: config?.dm || currentConfig.dm || {
              enabled: true,
              policy: "pairing",
              allowFrom: [],
            },
            guilds: config?.guilds || currentConfig.guilds,
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

    // Start Discord channel
    const startResponse = await this.client.request("channels.start", {
      channelId: "discord",
    }) as { ok: boolean; error?: { message: string } };

    if (!startResponse.ok) {
      const error = startResponse.error?.message || "Failed to start Discord";
      this.eventListeners.error?.(error);
      throw new Error(error);
    }

    // Poll for connection status (Discord connects quickly)
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
          const error = "Discord connection timeout. Please check your bot token.";
          this.eventListeners.error?.(error);
          throw new Error(error);
        }
      } catch (err: any) {
        const error = err.message || "Failed to verify Discord connection";
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
   * Disconnect Discord channel
   */
  async disconnect(): Promise<void> {
    const stopResponse = await this.client.request("channels.stop", {
      channelId: "discord",
    }) as { ok: boolean; error?: { message: string } };

    if (!stopResponse.ok) {
      throw new Error(stopResponse.error?.message || "Failed to stop Discord");
    }

    this.eventListeners.status?.({ status: "disconnected" });
  }
}
