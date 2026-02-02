import { useState, useEffect, useCallback } from "react";
import { useSignalService } from "../../core/gateway/use-services";
import { useGatewayContext } from "../../core/gateway/use-gateway-context";
import type { SignalConfig } from "../../core/channels/types";

export interface UseSignalChannelReturn {
  // State
  connected: boolean;
  connecting: boolean;
  error: string | null;
  config: SignalConfig;
  savingConfig: boolean;

  // Actions
  connect: (config?: Partial<SignalConfig>) => Promise<void>;
  disconnect: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<SignalConfig>) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for managing Signal channel connection and configuration
 * Uses gateway client from context
 * 
 * Note: Signal integration requires signal-cli setup for full functionality.
 */
export function useSignalChannel(
  options?: { enabled?: boolean }
): UseSignalChannelReturn {
  const { gatewayClient, connectionStatus } = useGatewayContext();
  const signalService = useSignalService();

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SignalConfig>({
    dmPolicy: "pairing",
    allowFrom: [],
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Setup event listeners
  useEffect(() => {
    if (!signalService || !options?.enabled) return;

    const handleStatus = (statusObj: {
      status: "connected" | "connecting" | "disconnected";
    }) => {
      const { status } = statusObj;
      if (status === "connected") {
        setConnected(true);
        setConnecting(false);
        setError(null);
        // Load config after connection
        setTimeout(() => {
          loadConfig();
        }, 500);
      } else if (status === "connecting") {
        setConnecting(true);
        setConnected(false);
        setError(null);
      } else if (status === "disconnected") {
        setConnected(false);
        setConnecting(false);
      }
    };

    const handleError = (err: string) => {
      setError(err);
      setConnecting(false);
    };

    signalService.on("status", handleStatus);
    signalService.on("error", handleError);

    return () => {
      signalService.off("status");
      signalService.off("error");
    };
  }, [signalService, options?.enabled]);

  // Service cleanup is handled by ServiceRegistry, no need for manual cleanup

  // Load config
  const loadConfig = useCallback(async () => {
    if (!signalService) return;
    try {
      const loadedConfig = await signalService.loadConfig();
      setConfig(loadedConfig);
    } catch (err: any) {
      console.error("Failed to load Signal config:", err);
    }
  }, [signalService]);

  // Load config when enabled and connected
  useEffect(() => {
    if (options?.enabled && signalService && connectionStatus === "connected") {
      loadConfig();
    }
  }, [options?.enabled, signalService, connectionStatus, loadConfig]);

  // Connect
  const connect = useCallback(
    async (connectConfig?: Partial<SignalConfig>) => {
      if (!signalService) {
        setError("Gateway client not available");
        return;
      }

      setConnecting(true);
      setError(null);

      try {
        await signalService.connect(connectConfig);
      } catch (err: any) {
        setError(err.message || "Failed to connect Signal");
        setConnecting(false);
      }
    },
    [signalService]
  );

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!signalService) return;
    try {
      await signalService.disconnect();
      setConnected(false);
    } catch (err: any) {
      setError(err.message || "Failed to disconnect Signal");
    }
  }, [signalService]);

  // Save config
  const saveConfig = useCallback(
    async (updates: Partial<SignalConfig>) => {
      if (!signalService) return;
      setSavingConfig(true);
      try {
        const newConfig = { ...config, ...updates };
        await signalService.saveConfig(newConfig);
        setConfig(newConfig);
      } catch (err: any) {
        setError(err.message || "Failed to save Signal config");
        throw err;
      } finally {
        setSavingConfig(false);
      }
    },
    [signalService, config]
  );

  // Reset state
  const reset = useCallback(() => {
    setConnected(false);
    setConnecting(false);
    setError(null);
  }, []);

  return {
    connected,
    connecting,
    error,
    config,
    savingConfig,
    connect,
    disconnect,
    loadConfig,
    saveConfig,
    reset,
  };
}
