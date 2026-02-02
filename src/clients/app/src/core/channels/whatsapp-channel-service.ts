import type { GatewayClient } from "../gateway/client";
import type { WhatsAppConfig, ChannelConnectionState, ChannelStatus } from "./types";

/**
 * WhatsApp Channel Service - handles WhatsApp channel connection and configuration
 */
export class WhatsAppChannelService {
  private eventListeners: {
    qr?: (qr: string | null) => void;
    connected?: (connected: boolean) => void;
    error?: (error: string) => void;
  } = {};

  constructor(private client: GatewayClient) {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for WhatsApp-specific events
   */
  private setupEventListeners(): void {
    const handleQrEvent = (e: CustomEvent<{ qr: string | null; channelId: string; cleared?: boolean }>) => {
      if (e.detail.channelId === "whatsapp") {
        if (e.detail.cleared || !e.detail.qr) {
          this.eventListeners.qr?.(null);
        } else {
          this.eventListeners.qr?.(e.detail.qr);
        }
      }
    };

    const handleConnectionEvent = (e: CustomEvent<{ connected: boolean; channelId: string }>) => {
      if (e.detail.channelId === "whatsapp") {
        this.eventListeners.connected?.(e.detail.connected);
      }
    };

    window.addEventListener("whatsapp-qr", handleQrEvent as EventListener);
    window.addEventListener("whatsapp-connection", handleConnectionEvent as EventListener);

    // Store cleanup function
    this.cleanup = () => {
      window.removeEventListener("whatsapp-qr", handleQrEvent as EventListener);
      window.removeEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
    };
  }

  private cleanup?: () => void;

  /**
   * Register event listeners
   */
  on<K extends keyof { qr: (qr: string | null) => void; connected: (connected: boolean) => void; error: (error: string) => void }>(
    event: K,
    handler: { qr: (qr: string | null) => void; connected: (connected: boolean) => void; error: (error: string) => void }[K]
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
   * Load WhatsApp configuration from gateway
   */
  async loadConfig(): Promise<WhatsAppConfig> {
    const configResponse = await this.client.request("config.get", {}) as {
      ok: boolean;
      result?: { config?: { channels?: { whatsapp?: WhatsAppConfig } } };
    };

    if (!configResponse.ok || !configResponse.result?.config?.channels?.whatsapp) {
      return {
        dmPolicy: "pairing",
        allowFrom: [],
      };
    }

    return {
      dmPolicy: configResponse.result.config.channels.whatsapp.dmPolicy || "pairing",
      allowFrom: configResponse.result.config.channels.whatsapp.allowFrom || [],
    };
  }

  /**
   * Save WhatsApp configuration
   */
  async saveConfig(config: WhatsAppConfig, immediate = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const performSave = async () => {
        try {
          const configResponse = await this.client.request("config.update", {
            updates: {
              channels: {
                whatsapp: config,
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

          resolve();
        } catch (err: any) {
          reject(err);
        }
      };

      if (immediate) {
        performSave();
      } else {
        // Debounce saves to prevent rapid-fire reloads
        setTimeout(performSave, 500);
      }
    });
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

    return statusResponse.result.status.find((s) => s.id === "whatsapp") || null;
  }

  /**
   * Connect WhatsApp channel
   */
  async connect(config?: Partial<WhatsAppConfig>): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    // Load existing config or use provided/default
    const currentConfig = config ? { ...await this.loadConfig(), ...config } : await this.loadConfig();

    // Enable WhatsApp in config
    const configResponse = await this.client.request("config.update", {
      updates: {
        channels: {
          whatsapp: {
            enabled: true,
            dmPolicy: currentConfig.dmPolicy || "pairing",
            allowFrom: currentConfig.allowFrom || [],
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

    // Start WhatsApp channel
    const startResponse = await this.client.request("channels.start", {
      channelId: "whatsapp",
    }) as { ok: boolean; error?: { message: string } };

    if (!startResponse.ok) {
      const error = startResponse.error?.message || "Failed to start WhatsApp";
      this.eventListeners.error?.(error);
      throw new Error(error);
    }

    // Check if already connected (credentials exist)
    try {
      const status = await this.getStatus();
      if (status?.connected) {
        this.eventListeners.connected?.(true);
        return;
      }
    } catch {
      // Continue with QR code flow if status check fails
    }

    // QR code will be emitted via event listener
  }

  /**
   * Disconnect WhatsApp channel
   */
  async disconnect(): Promise<void> {
    const stopResponse = await this.client.request("channels.stop", {
      channelId: "whatsapp",
    }) as { ok: boolean; error?: { message: string } };

    if (!stopResponse.ok) {
      throw new Error(stopResponse.error?.message || "Failed to stop WhatsApp");
    }

    this.eventListeners.connected?.(false);
  }
}
