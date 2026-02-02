import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { GatewayClient } from "../../core/gateway/client";
import { SignalChannelService } from "../../core/channels/signal-channel-service";
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
 * 
 * Note: Signal integration requires signal-cli setup for full functionality.
 */
export function useSignalChannel(
  gatewayClient: GatewayClient | null,
  options?: { enabled?: boolean }
): UseSignalChannelReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SignalConfig>({
    dmPolicy: "pairing",
    allowFrom: [],
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const serviceRef = useRef<SignalChannelService | null>(null);

  // Initialize service
  const service = useMemo(() => {
    if (!gatewayClient) return null;
    if (!serviceRef.current) {
      serviceRef.current = new SignalChannelService(gatewayClient);
    }
    return serviceRef.current;
  }, [gatewayClient]);

  // Setup event listeners
  useEffect(() => {
    if (!service || !options?.enabled) return;

    const handleConnected = (isConnected: boolean) => {
      setConnected(isConnected);
      if (isConnected) {
        setConnecting(false);
        setError(null);
        // Load config after connection
        setTimeout(() => {
          loadConfig();
        }, 500);
      }
    };

    const handleError = (err: string) => {
      setError(err);
      setConnecting(false);
    };

    service.on("connected", handleConnected);
    service.on("error", handleError);

    return () => {
      service.off("connected");
      service.off("error");
    };
  }, [service, options?.enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      serviceRef.current?.destroy();
      serviceRef.current = null;
    };
  }, []);

  // Load config
  const loadConfig = useCallback(async () => {
    if (!service) return;
    try {
      const loadedConfig = await service.loadConfig();
      setConfig(loadedConfig);
    } catch (err: any) {
      console.error("Failed to load Signal config:", err);
    }
  }, [service]);

  // Load config when enabled
  useEffect(() => {
    if (options?.enabled && service && gatewayClient?.isConnected()) {
      loadConfig();
    }
  }, [options?.enabled, service, gatewayClient?.isConnected(), loadConfig]);

  // Connect
  const connect = useCallback(
    async (connectConfig?: Partial<SignalConfig>) => {
      if (!service) {
        setError("Gateway client not available");
        return;
      }

      setConnecting(true);
      setError(null);

      try {
        await service.connect(connectConfig);
      } catch (err: any) {
        setError(err.message || "Failed to connect Signal");
        setConnecting(false);
      }
    },
    [service]
  );

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!service) return;
    try {
      await service.disconnect();
      setConnected(false);
    } catch (err: any) {
      setError(err.message || "Failed to disconnect Signal");
    }
  }, [service]);

  // Save config
  const saveConfig = useCallback(
    async (updates: Partial<SignalConfig>) => {
      if (!service) return;
      setSavingConfig(true);
      try {
        const newConfig = { ...config, ...updates };
        await service.saveConfig(newConfig);
        setConfig(newConfig);
      } catch (err: any) {
        setError(err.message || "Failed to save Signal config");
        throw err;
      } finally {
        setSavingConfig(false);
      }
    },
    [service, config]
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
