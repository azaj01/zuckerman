import { isGatewayRunning } from "@core/gateway/gateway-status.js";
import { startGatewayServer, type GatewayServer } from "@server/world/communication/gateway/server/index.js";
import { getGatewaySettings } from "../../core/storage/settings-storage.js";

export interface GatewayStatus {
  running: boolean;
  address?: string;
  error?: string;
}

export interface GatewayResult {
  success: boolean;
  error?: string;
  alreadyRunning?: boolean;
}

/**
 * Single service for managing gateway lifecycle
 * 
 * Features:
 * - Singleton pattern prevents multiple instances
 * - Built-in concurrency guard
 * - Idempotent operations (safe to call multiple times)
 * - Clean error handling
 */
class GatewayService {
  private server: GatewayServer | null = null;
  private startingPromise: Promise<GatewayResult> | null = null;
  private electronAPI: typeof window.electronAPI | null = null;

  /**
   * Initialize with Electron API (call once at app startup)
   */
  initialize(electronAPI: typeof window.electronAPI): void {
    this.electronAPI = electronAPI;
  }

  /**
   * Ensure gateway is running (idempotent - safe to call multiple times)
   * This is the main entry point - use this instead of start()
   */
  async ensureRunning(options?: { host?: string; port?: number }): Promise<GatewayResult> {
    if (!this.electronAPI) {
      return { success: false, error: "GatewayService not initialized" };
    }

    const config = getGatewaySettings();
    const host = options?.host ?? config.host ?? "127.0.0.1";
    const port = options?.port ?? config.port ?? 18789;

    // Check if already running
    const status = await this.getStatus(host, port);
    if (status.running) {
      return { success: true, alreadyRunning: true };
    }

    // Use concurrent guard - if already starting, wait for that
    if (this.startingPromise) {
      return this.startingPromise;
    }

    // Start gateway
    this.startingPromise = this.start(host, port);
    this.startingPromise.finally(() => {
      this.startingPromise = null;
    });

    return this.startingPromise;
  }

  /**
   * Start the gateway server
   */
  private async start(host: string, port: number): Promise<GatewayResult> {
    if (!this.electronAPI) {
      return { success: false, error: "GatewayService not initialized" };
    }

    console.log(`[Gateway] Starting gateway on ${host}:${port}`);

    // Check one more time before starting (race condition protection)
    if (await isGatewayRunning(host, port)) {
      console.log(`[Gateway] Gateway already running - connecting to existing instance`);
      return { success: true, alreadyRunning: true };
    }

    // Clean up our own server instance if we have one
    if (this.server) {
      try {
        await this.server.close("Restarting");
      } catch (err) {
        console.warn("[Gateway] Error closing existing server:", err);
      }
      this.server = null;
    }

    // Try to start via IPC (main process)
    try {
      const result = await this.electronAPI.gatewayStart(host, port);
      
      // If start reported failure, check if gateway is actually running now
      if (!result.success) {
        await this.wait(500);
        const status = await this.getStatus(host, port);
        if (status.running) {
          return { success: true, alreadyRunning: true };
        }
      }
      
      return { success: result.success, error: result.error };
    } catch (error: any) {
      // Check if gateway started despite the error
      await this.wait(500);
      const status = await this.getStatus(host, port);
      if (status.running) {
        return { success: true, alreadyRunning: true };
      }
      
      const errorMessage = error?.message || "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Stop the gateway server
   */
  async stop(host: string = "127.0.0.1", port: number = 18789): Promise<GatewayResult> {
    if (!this.electronAPI) {
      return { success: false, error: "GatewayService not initialized" };
    }

    try {
      // Close our server instance if we have it
      if (this.server) {
        await this.server.close("Stopped via API");
        this.server = null;
      }

      // Stop via IPC
      const result = await this.electronAPI.gatewayStop(host, port);
      
      // Wait a bit and verify it's stopped
      await this.wait(500);
      const status = await this.getStatus(host, port);
      
      if (status.running) {
        return { success: false, error: "Gateway is still running" };
      }

      return { success: result.success, error: result.error };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: `Failed to stop gateway: ${errorMessage}` };
    }
  }

  /**
   * Get gateway status
   */
  async getStatus(host: string = "127.0.0.1", port: number = 18789): Promise<GatewayStatus> {
    if (!this.electronAPI) {
      return { running: false, error: "GatewayService not initialized" };
    }

    try {
      return await this.electronAPI.gatewayStatus(host, port);
    } catch (err) {
      return {
        running: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Wait for gateway to become ready
   */
  async waitForReady(
    host: string = "127.0.0.1",
    port: number = 18789,
    maxAttempts: number = 10,
    delayMs: number = 500
  ): Promise<{ ready: boolean; attempts: number }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.getStatus(host, port);
      if (status.running) {
        return { ready: true, attempts: attempt };
      }
      if (attempt < maxAttempts) {
        await this.wait(delayMs);
      }
    }
    return { ready: false, attempts: maxAttempts };
  }

  /**
   * Cleanup on app exit
   */
  async cleanup(): Promise<void> {
    if (this.server) {
      try {
        await this.server.close("App shutting down");
      } catch (err) {
        console.error("[Gateway] Error during cleanup:", err);
      }
      this.server = null;
    }
  }

  /**
   * Helper to wait
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const gatewayService = new GatewayService();
