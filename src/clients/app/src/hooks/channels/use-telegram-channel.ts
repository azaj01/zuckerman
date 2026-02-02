import { useState, useEffect, useCallback } from "react";
import { useTelegramService } from "../../core/gateway/use-services";
import { useGatewayContext } from "../../core/gateway/use-gateway-context";
import type { TelegramConfig } from "../../core/channels/types";

export interface UseTelegramChannelReturn {
  // State
  connected: boolean;
  connecting: boolean;
  error: string | null;
  config: TelegramConfig;
  savingConfig: boolean;

  // Actions
  connect: (botToken: string, config?: Partial<TelegramConfig>) => Promise<void>;
  disconnect: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<TelegramConfig>) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for managing Telegram channel connection and configuration
 * Uses gateway client from context
 */
export function useTelegramChannel(
  options?: { enabled?: boolean }
): UseTelegramChannelReturn {
  const { gatewayClient, connectionStatus } = useGatewayContext();
  const telegramService = useTelegramService();

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<TelegramConfig>({
    dmPolicy: "pairing",
    allowFrom: [],
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Setup event listeners
  useEffect(() => {
    if (!telegramService || !options?.enabled) return;

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

    telegramService.on("status", handleStatus);
    telegramService.on("error", handleError);

    return () => {
      telegramService.off("status");
      telegramService.off("error");
    };
  }, [telegramService, options?.enabled]);

  // Service cleanup is handled by ServiceRegistry, no need for manual cleanup

  // Load config
  const loadConfig = useCallback(async () => {
    if (!telegramService) return;
    try {
      const loadedConfig = await telegramService.loadConfig();
      setConfig(loadedConfig);
    } catch (err: any) {
      console.error("Failed to load Telegram config:", err);
    }
  }, [telegramService]);

  // Load config when enabled and connected
  useEffect(() => {
    if (options?.enabled && telegramService && connectionStatus === "connected") {
      loadConfig();
    }
  }, [options?.enabled, telegramService, connectionStatus, loadConfig]);

  // Connect
  const connect = useCallback(
    async (botToken: string, connectConfig?: Partial<TelegramConfig>) => {
      if (!telegramService) {
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
        await telegramService.connect(botToken, connectConfig);
      } catch (err: any) {
        setError(err.message || "Failed to connect Telegram");
        setConnecting(false);
      }
    },
    [telegramService]
  );

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!telegramService) return;
    try {
      await telegramService.disconnect();
      setConnected(false);
    } catch (err: any) {
      setError(err.message || "Failed to disconnect Telegram");
    }
  }, [telegramService]);

  // Save config
  const saveConfig = useCallback(
    async (updates: Partial<TelegramConfig>) => {
      if (!telegramService) return;
      setSavingConfig(true);
      try {
        const newConfig = { ...config, ...updates };
        await telegramService.saveConfig(newConfig);
        setConfig(newConfig);
      } catch (err: any) {
        setError(err.message || "Failed to save Telegram config");
        throw err;
      } finally {
        setSavingConfig(false);
      }
    },
    [telegramService, config]
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
