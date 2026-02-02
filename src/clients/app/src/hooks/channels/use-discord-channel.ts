import { useState, useEffect, useCallback } from "react";
import type { GatewayClient } from "../../core/gateway/client";
import { useDiscordService } from "../../core/gateway/use-services";
import { useGatewayContext } from "../../core/gateway/use-gateway-context";
import type { DiscordConfig } from "../../core/channels/types";

export interface UseDiscordChannelReturn {
  // State
  connected: boolean;
  connecting: boolean;
  error: string | null;
  config: DiscordConfig;
  savingConfig: boolean;

  // Actions
  connect: (botToken: string, config?: Partial<DiscordConfig>) => Promise<void>;
  disconnect: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<DiscordConfig>) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for managing Discord channel connection and configuration
 */
export function useDiscordChannel(
  gatewayClient: GatewayClient | null,
  options?: { enabled?: boolean }
): UseDiscordChannelReturn {
  const { gatewayClient: contextClient } = useGatewayContext();
  const discordService = useDiscordService();

  // Use gatewayClient from context if not provided (for backward compatibility)
  const effectiveClient = gatewayClient || contextClient;
  const service = discordService;

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<DiscordConfig>({
    dm: {
      enabled: true,
      policy: "pairing",
      allowFrom: [],
    },
  });
  const [savingConfig, setSavingConfig] = useState(false);

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

  // Service cleanup is handled by ServiceRegistry, no need for manual cleanup

  // Load config
  const loadConfig = useCallback(async () => {
    if (!service) return;
    try {
      const loadedConfig = await service.loadConfig();
      setConfig(loadedConfig);
    } catch (err: any) {
      console.error("Failed to load Discord config:", err);
    }
  }, [service]);

  // Load config when enabled
  useEffect(() => {
    if (options?.enabled && service && effectiveClient?.isConnected()) {
      loadConfig();
    }
  }, [options?.enabled, service, effectiveClient, loadConfig]);

  // Connect
  const connect = useCallback(
    async (botToken: string, connectConfig?: Partial<DiscordConfig>) => {
      if (!service) {
        setError("Gateway client not available");
        return;
      }

      if (!botToken.trim()) {
        setError("Bot token is required");
        return;
      }

      setConnecting(true);
      setError(null);

      try {
        await service.connect(botToken, connectConfig);
      } catch (err: any) {
        setError(err.message || "Failed to connect Discord");
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
      setError(err.message || "Failed to disconnect Discord");
    }
  }, [service]);

  // Save config
  const saveConfig = useCallback(
    async (updates: Partial<DiscordConfig>) => {
      if (!service) return;
      setSavingConfig(true);
      try {
        const newConfig = { ...config, ...updates };
        await service.saveConfig(newConfig);
        setConfig(newConfig);
      } catch (err: any) {
        setError(err.message || "Failed to save Discord config");
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
