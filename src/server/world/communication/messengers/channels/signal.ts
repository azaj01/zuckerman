import type { Channel, ChannelMessage } from "./types.js";
import type { SignalConfig } from "@server/world/config/types.js";

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
  private isRunning = false;
  private connectionCallback?: (connected: boolean) => void;

  constructor(config: SignalConfig, connectionCallback?: (connected: boolean) => void) {
    this.config = config;
    this.connectionCallback = connectionCallback;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[Signal] Channel is disabled in config");
      return;
    }

    // Signal integration requires signal-cli or similar
    // This is a placeholder implementation
    console.log("[Signal] Signal channel requires signal-cli setup. Please configure signal-cli separately.");
    
    // For now, mark as running if enabled (actual implementation would connect to signal-cli)
    this.isRunning = true;
    
    if (this.connectionCallback) {
      this.connectionCallback(true);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.connectionCallback) {
      this.connectionCallback(false);
    }
  }

  async send(message: string, to: string): Promise<void> {
    if (!this.isRunning) {
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
    return this.isRunning;
  }
}
