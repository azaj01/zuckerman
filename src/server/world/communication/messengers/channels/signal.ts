import type { Channel, ChannelMessage } from "./types.js";
import type { SignalConfig } from "@server/world/config/types.js";

enum ChannelState {
  IDLE = "idle",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  STOPPING = "stopping",
}

/**
 * Signal Channel Implementation
 * 
 * Note: Signal integration typically requires signal-cli or similar tools.
 * This is a basic implementation that can be extended with actual Signal protocol support.
 * For production use, you would need to integrate with signal-cli or use Signal's official APIs.
 */
export class SignalChannel implements Channel {
  id: string = "signal";
  type = "signal" as const;
  private config: SignalConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private state: ChannelState = ChannelState.IDLE;
  private statusCallback?: (status: {
    status: "connected" | "connecting" | "disconnected";
  }) => void;

  constructor(config: SignalConfig, statusCallback?: (status: {
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
      console.log("[Signal] Channel is disabled in config");
      this.state = ChannelState.IDLE;
      return;
    }

    // Don't start if stopping
    if (this.state === ChannelState.STOPPING) {
      return;
    }

    this.state = ChannelState.CONNECTING;
    this.notifyStatus("connecting");

    // Signal integration requires signal-cli or similar
    // This is a placeholder implementation
    console.log("[Signal] Signal channel requires signal-cli setup. Please configure signal-cli separately.");
    
    // For now, mark as connected if enabled (actual implementation would connect to signal-cli)
    this.state = ChannelState.CONNECTED;
    this.notifyStatus("connected");
  }

  async stop(): Promise<void> {
    if (this.state === ChannelState.STOPPING || this.state === ChannelState.IDLE) {
      return;
    }

    this.state = ChannelState.STOPPING;
    this.state = ChannelState.IDLE;
    this.notifyStatus("disconnected");
  }

  async send(message: string, to: string): Promise<void> {
    if (this.state !== ChannelState.CONNECTED) {
      throw new Error("Signal channel is not connected");
    }

    // Placeholder - actual implementation would use signal-cli
    console.log(`[Signal] Would send message to ${to}: ${message}`);
    throw new Error("Signal integration requires signal-cli setup. Please configure signal-cli to enable message sending.");
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  isConnected(): boolean {
    return this.state === ChannelState.CONNECTED;
  }

  private notifyStatus(status: "connected" | "connecting" | "disconnected"): void {
    if (this.statusCallback) {
      this.statusCallback({ status });
    }
  }
}
