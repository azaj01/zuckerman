import { useState, useEffect, useCallback } from "react";
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
 * Uses gateway client from context
 */
export function useDiscordChannel(
  options?: { enabled?: boolean }
): UseDiscordChannelReturn {
  const { gatewayClient, connectionStatus } = useGatewayContext();
  const discordService = useDiscordService();

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
    if (!discordService || !options?.enabled) return;

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

    discordService.on("status", handleStatus);
    discordService.on("error", handleError);

    return () => {
      discordService.off("status");
      discordService.off("error");
    };
  }, [discordService, options?.enabled]);

  // Service cleanup is handled by ServiceRegistry, no need for manual cleanup

  // Load config
  const loadConfig = useCallback(async () => {
    if (!discordService) return;
    try {
      const loadedConfig = await discordService.loadConfig();
      setConfig(loadedConfig);
    } catch (err: any) {
      console.error("Failed to load Discord config:", err);
    }
  }, [discordService]);

  // Load config when enabled and connected
  useEffect(() => {
    if (options?.enabled && discordService && connectionStatus === "connected") {
      loadConfig();
    }
  }, [options?.enabled, discordService, connectionStatus, loadConfig]);

  // Connect
  const connect = useCallback(
    async (botToken: string, connectConfig?: Partial<DiscordConfig>) => {
      if (!discordService) {
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
        await discordService.connect(botToken, connectConfig);
      } catch (err: any) {
        setError(err.message || "Failed to connect Discord");
        setConnecting(false);
      }
    },
    [discordService]
  );

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!discordService) return;
    try {
      await discordService.disconnect();
      setConnected(false);
    } catch (err: any) {
      setError(err.message || "Failed to disconnect Discord");
    }
  }, [discordService]);

  // Save config
  const saveConfig = useCallback(
    async (updates: Partial<DiscordConfig>) => {
      if (!discordService) return;
      setSavingConfig(true);
      try {
        const newConfig = { ...config, ...updates };
        await discordService.saveConfig(newConfig);
        setConfig(newConfig);
      } catch (err: any) {
        setError(err.message || "Failed to save Discord config");
        throw err;
      } finally {
        setSavingConfig(false);
      }
    },
    [discordService, config]
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
