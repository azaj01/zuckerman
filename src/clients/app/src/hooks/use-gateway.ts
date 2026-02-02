import { useState, useEffect, useRef, useCallback } from "react";
import { useGatewayContext } from "../core/gateway/use-gateway-context";
import { gatewayService } from "../core/gateway/gateway-service";
import type { ConnectionStatus } from "../core/gateway/gateway-context";

export type { ConnectionStatus };

export interface GatewayStatus {
  running: boolean;
  address?: string;
  error?: string;
}

export interface UseGatewayReturn {
  // Connection state (from context)
  gatewayClient: ReturnType<typeof useGatewayContext>["gatewayClient"];
  connectionStatus: ConnectionStatus;
  
  // Connection actions
  connect: () => Promise<void>;
  disconnect: () => void;
  
  // Server management
  serverStatus: GatewayStatus | null;
  isServerLoading: boolean;
  isServerStarting: boolean;
  isServerStopping: boolean;
  startServer: (host: string, port: number) => Promise<boolean>;
  stopServer: (host: string, port: number) => Promise<boolean>;
  checkServerStatus: (host: string, port: number) => Promise<void>;
  startPolling: (host: string, port: number, interval?: number) => void;
  stopPolling: () => void;
}

const EXPLICITLY_STOPPED_KEY = "zuckerman:gateway:explicitly-stopped";

/**
 * Hook for gateway connection actions and server management
 * Gets client and connection status from GatewayContext (managed by GatewayProvider)
 * Provides connection actions and server lifecycle management
 */
export function useGateway(): UseGatewayReturn {
  // Get client and connection status from context (single source of truth)
  const { gatewayClient, connectionStatus: contextConnectionStatus } = useGatewayContext();
  const connectingRef = useRef(false);

  // Server management state
  const [serverStatus, setServerStatus] = useState<GatewayStatus | null>(null);
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [isServerStarting, setIsServerStarting] = useState(false);
  const [isServerStopping, setIsServerStopping] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to check if gateway was explicitly stopped (persisted across hook instances)
  const isExplicitlyStopped = useCallback((): boolean => {
    return localStorage.getItem(EXPLICITLY_STOPPED_KEY) === "true";
  }, []);

  // Helper to set explicitly stopped state
  const setExplicitlyStopped = useCallback((stopped: boolean): void => {
    if (stopped) {
      localStorage.setItem(EXPLICITLY_STOPPED_KEY, "true");
    } else {
      localStorage.removeItem(EXPLICITLY_STOPPED_KEY);
    }
  }, []);

  // Auto-initialize and start gateway server on mount (only if autoStart is enabled and not explicitly stopped)
  useEffect(() => {
    if (!window.electronAPI) {
      console.warn("[Gateway] electronAPI not available, skipping gateway start");
      return;
    }

    // Check autoStart setting
    const settings = localStorage.getItem("zuckerman:settings");
    let autoStart = true; // Default to true for backward compatibility
    if (settings) {
      try {
        const parsed = JSON.parse(settings);
        autoStart = parsed.gateway?.autoStart !== false;
      } catch {
        // Use default
      }
    }

    gatewayService.initialize(window.electronAPI);
    
    // Only auto-start if enabled and not explicitly stopped
    if (autoStart && !isExplicitlyStopped()) {
      gatewayService.ensureRunning().then((result) => {
        if (result.success) {
          if (result.alreadyRunning) {
            console.log("[Gateway] Gateway was already running");
          } else {
            console.log("[Gateway] Gateway started successfully");
          }
        } else {
          const errorMsg = result.error || "Failed to start gateway";
          console.warn("[Gateway] Gateway startup issue (non-critical):", errorMsg);
        }
      }).catch((err) => {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.warn("[Gateway] Gateway startup error (non-critical):", errorMessage);
      });
    } else {
      console.log("[Gateway] Skipping auto-start (autoStart disabled or explicitly stopped)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connection actions (work with context client)
  const connect = useCallback(async () => {
    if (!gatewayClient || gatewayClient.isConnected() || connectingRef.current) {
      return;
    }

    connectingRef.current = true;
    try {
      await gatewayClient.connect();
      // Connection status will be updated via event handlers in GatewayProvider
    } catch (error) {
      console.error("[Gateway] Failed to connect:", error);
    } finally {
      connectingRef.current = false;
    }
  }, [gatewayClient]);

  // Auto-reconnect on disconnect (only if gateway wasn't explicitly stopped)
  useEffect(() => {
    if (!gatewayClient) return;

    const checkInterval = setInterval(() => {
      const isConnected = gatewayClient.isConnected();
      const shouldReconnect = !isConnected && 
                              contextConnectionStatus === "disconnected" && 
                              !connectingRef.current &&
                              !isExplicitlyStopped() &&
                              serverStatus?.running;

      if (shouldReconnect) {
        console.log("[Gateway] Connection lost, attempting to reconnect...");
        connect();
      }
    }, 2000);

    return () => clearInterval(checkInterval);
  }, [gatewayClient, contextConnectionStatus, connect, serverStatus, isExplicitlyStopped]);

  const disconnect = useCallback(() => {
    if (gatewayClient) {
      gatewayClient.disconnect();
      // Connection status will be updated via event handlers in GatewayProvider
    }
  }, [gatewayClient]);


  // Server management actions
  const checkServerStatus = useCallback(async (host: string, port: number) => {
    if (!window.electronAPI) {
      setServerStatus({ running: false, error: "Electron API not available" });
      return;
    }

    setIsServerLoading(true);
    try {
      const result = await window.electronAPI.gatewayStatus(host, port);
      setServerStatus(result);
    } catch (error) {
      setServerStatus({
        running: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsServerLoading(false);
    }
  }, []);

  const startServer = useCallback(async (host: string, port: number): Promise<boolean> => {
    if (!window.electronAPI) {
      throw new Error("Electron API not available");
    }

    setIsServerStarting(true);
    setExplicitlyStopped(false); // Clear the explicitly stopped flag when starting
    try {
      const result = await window.electronAPI.gatewayStart(host, port);
      if (result.success) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await checkServerStatus(host, port);
        return true;
      } else {
        setServerStatus({
          running: false,
          error: result.error || "Failed to start gateway",
        });
        return false;
      }
    } catch (error) {
      setServerStatus({
        running: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    } finally {
      setIsServerStarting(false);
    }
  }, [checkServerStatus, setExplicitlyStopped]);

  const stopServer = useCallback(async (host: string, port: number): Promise<boolean> => {
    if (!window.electronAPI) {
      throw new Error("Electron API not available");
    }

    setIsServerStopping(true);
    setExplicitlyStopped(true); // Mark as explicitly stopped to prevent auto-reconnect
    try {
      const result = await window.electronAPI.gatewayStop(host, port);
      if (result.success) {
        // Disconnect the client when stopping the server
        if (gatewayClient) {
          gatewayClient.disconnect();
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        await checkServerStatus(host, port);
        return true;
      } else {
        setServerStatus({
          running: serverStatus?.running || false,
          error: result.error || "Failed to stop gateway",
        });
        return false;
      }
    } catch (error) {
      setServerStatus({
        running: serverStatus?.running || false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    } finally {
      setIsServerStopping(false);
    }
  }, [checkServerStatus, serverStatus, gatewayClient, setExplicitlyStopped]);

  const startPolling = useCallback((host: string, port: number, interval: number = 5000) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(() => {
      checkServerStatus(host, port);
    }, interval);
  }, [checkServerStatus]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    gatewayClient,
    connectionStatus: contextConnectionStatus,
    connect,
    disconnect,
    serverStatus,
    isServerLoading,
    isServerStarting,
    isServerStopping,
    startServer,
    stopServer,
    checkServerStatus,
    startPolling,
    stopPolling,
  };
}
