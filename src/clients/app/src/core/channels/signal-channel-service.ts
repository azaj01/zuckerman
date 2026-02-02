import type { GatewayClient } from "../gateway/client";
import type { SignalConfig, ChannelConnectionState, ChannelStatus } from "./types";

/**
 * Signal Channel Service - handles Signal channel connection and configuration
 * 
 * Note: Signal integration requires signal-cli or similar tools for full functionality.
 */
export class SignalChannelService {
  private eventListeners: {
    status?: (status: { status: "connected" | "connecting" | "disconnected" }) => void;
    error?: (error: string) => void;
  } = {};

  constructor(private client: GatewayClient) {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for Signal-specific events
   */
  private setupEventListeners(): void {
    const handleStatusEvent = (e: CustomEvent<{
      status: "connected" | "connecting" | "disconnected";
      channelId: string;
    }>) => {
      if (e.detail.channelId === "signal") {
        this.eventListeners.status?.({
          status: e.detail.status,
        });
      }
    };

    window.addEventListener("signal-status", handleStatusEvent as EventListener);

    // Store cleanup function
    this.cleanup = () => {
      window.removeEventListener("signal-status", handleStatusEvent as EventListener);
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
   * Load Signal configuration from gateway
   */
  async loadConfig(): Promise<SignalConfig> {
    const configResponse = await this.client.request("config.get", {}) as {
      ok: boolean;
      result?: { config?: { channels?: { signal?: SignalConfig } } };
    };

    if (!configResponse.ok || !configResponse.result?.config?.channels?.signal) {
      return {
        dmPolicy: "pairing",
        allowFrom: [],
      };
    }

    return {
      dmPolicy: configResponse.result.config.channels.signal.dmPolicy || "pairing",
      allowFrom: configResponse.result.config.channels.signal.allowFrom || [],
    };
  }

  /**
   * Save Signal configuration
   */
  async saveConfig(config: SignalConfig): Promise<void> {
    const configResponse = await this.client.request("config.update", {
      updates: {
        channels: {
          signal: config,
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

    return statusResponse.result.status.find((s) => s.id === "signal") || null;
  }

  /**
   * Connect Signal channel
   * Note: Signal requires signal-cli setup for full functionality
   */
  async connect(config?: Partial<SignalConfig>): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    // Load existing config or use provided/default
    const currentConfig = await this.loadConfig();

    // Enable Signal in config
    const configResponse = await this.client.request("config.update", {
      updates: {
        channels: {
          signal: {
            enabled: true,
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

    // Start Signal channel
    const startResponse = await this.client.request("channels.start", {
      channelId: "signal",
    }) as { ok: boolean; error?: { message: string } };

    if (!startResponse.ok) {
      const error = startResponse.error?.message || "Failed to start Signal";
      this.eventListeners.error?.(error);
      throw new Error(error);
    }

    // Poll for connection status
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
          const error = "Signal connection timeout. Please ensure signal-cli is properly configured.";
          this.eventListeners.error?.(error);
          throw new Error(error);
        }
      } catch (err: any) {
        const error = err.message || "Failed to verify Signal connection";
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
   * Disconnect Signal channel
   */
  async disconnect(): Promise<void> {
    const stopResponse = await this.client.request("channels.stop", {
      channelId: "signal",
    }) as { ok: boolean; error?: { message: string } };

    if (!stopResponse.ok) {
      throw new Error(stopResponse.error?.message || "Failed to stop Signal");
    }

    this.eventListeners.status?.({ status: "disconnected" });
  }
}
