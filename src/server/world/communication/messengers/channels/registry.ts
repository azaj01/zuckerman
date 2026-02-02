import type { Channel, ChannelId, ChannelConfig } from "./types.js";

type ChannelStatus = "idle" | "starting" | "connected" | "stopping";

export class ChannelRegistry {
  private channels = new Map<ChannelId, Channel>();
  private configs = new Map<ChannelId, ChannelConfig>();
  private statuses = new Map<ChannelId, ChannelStatus>();

  register(channel: Channel, config: ChannelConfig): void {
    this.channels.set(channel.id, channel);
    this.configs.set(channel.id, config);
    // Initialize status based on current connection state
    this.statuses.set(channel.id, channel.isConnected() ? "connected" : "idle");
  }

  get(id: ChannelId): Channel | undefined {
    return this.channels.get(id);
  }

  list(): Channel[] {
    return Array.from(this.channels.values());
  }

  getConfig(id: ChannelId): ChannelConfig | undefined {
    return this.configs.get(id);
  }

  getStatus(id: ChannelId): ChannelStatus {
    return this.statuses.get(id) || "idle";
  }

  async startAll(): Promise<void> {
    // Start all channels in parallel (non-blocking)
    const startPromises = Array.from(this.channels.values()).map(async (channel) => {
      const status = this.statuses.get(channel.id);
      
      // If already connected, update status and return
      if (channel.isConnected()) {
        this.statuses.set(channel.id, "connected");
        return;
      }

      // If marked as "starting" but not actually connected, reset to idle to allow restart
      // This handles cases where a previous start attempt failed or was interrupted
      if (status === "starting") {
        this.statuses.set(channel.id, "idle");
      }

      // Skip if already connected (double-check after reset)
      if (status === "connected") {
        return;
      }

      // Mark as starting
      this.statuses.set(channel.id, "starting");

      try {
        console.log(`[Channels] Starting channel ${channel.id}...`);
        await channel.start();
        
        // Update status based on actual connection state
        this.statuses.set(channel.id, channel.isConnected() ? "connected" : "idle");
        console.log(`[Channels] Channel ${channel.id} started successfully`);
      } catch (err) {
        console.error(`[Channels] Failed to start channel ${channel.id}:`, err);
        this.statuses.set(channel.id, "idle");
        // Continue starting other channels even if one fails
      }
    });
    
    // Wait for all channels to attempt startup (but don't block indefinitely)
    await Promise.allSettled(startPromises);
  }

  async start(id: ChannelId): Promise<void> {
    const channel = this.channels.get(id);
    if (!channel) {
      throw new Error(`Channel "${id}" not found`);
    }

    const status = this.statuses.get(id);
    
    // If already connected, update status and return
    if (channel.isConnected()) {
      this.statuses.set(id, "connected");
      return;
    }

    // If marked as "starting" but not actually connected, reset to idle to allow restart
    // This handles cases where a previous start attempt failed or was interrupted
    if (status === "starting") {
      this.statuses.set(id, "idle");
    }

    // Skip if already connected (double-check after reset)
    if (status === "connected") {
      return;
    }

    // Mark as starting
    this.statuses.set(id, "starting");

    try {
      await channel.start();
      // Update status based on actual connection state
      this.statuses.set(id, channel.isConnected() ? "connected" : "idle");
    } catch (err) {
      this.statuses.set(id, "idle");
      throw err;
    }
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.channels.values()).map(async (channel) => {
      const status = this.statuses.get(channel.id);
      
      // Skip if already stopping or idle
      if (status === "stopping" || status === "idle") {
        return;
      }

      // Mark as stopping
      this.statuses.set(channel.id, "stopping");

      try {
        await channel.stop();
        this.statuses.set(channel.id, "idle");
      } catch (err) {
        console.error(`[Channels] Failed to stop channel ${channel.id}:`, err);
        this.statuses.set(channel.id, "idle");
      }
    });

    await Promise.allSettled(stopPromises);
  }

  async stop(id: ChannelId): Promise<void> {
    const channel = this.channels.get(id);
    if (!channel) {
      throw new Error(`Channel "${id}" not found`);
    }

    const status = this.statuses.get(id);
    
    // Skip if already stopping or idle
    if (status === "stopping" || status === "idle") {
      return;
    }

    // Mark as stopping
    this.statuses.set(id, "stopping");

    try {
      await channel.stop();
      this.statuses.set(id, "idle");
    } catch (err) {
      this.statuses.set(id, "idle");
      throw err;
    }
  }

  clear(): void {
    this.channels.clear();
    this.configs.clear();
    this.statuses.clear();
  }
}
