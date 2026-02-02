import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { GatewayClient } from "../../core/gateway/client";
import { WhatsAppChannelService } from "../../core/channels/whatsapp-channel-service";
import type { WhatsAppConfig } from "../../core/channels/types";

export interface UseWhatsAppChannelReturn {
  // State
  connected: boolean;
  connecting: boolean;
  qrCode: string | null;
  error: string | null;
  config: WhatsAppConfig;
  savingConfig: boolean;

  // Actions
  connect: (config?: Partial<WhatsAppConfig>) => Promise<void>;
  disconnect: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<WhatsAppConfig>, immediate?: boolean) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for managing WhatsApp channel connection and configuration
 */
export function useWhatsAppChannel(
  gatewayClient: GatewayClient | null,
  options?: { enabled?: boolean }
): UseWhatsAppChannelReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<WhatsAppConfig>({
    dmPolicy: "pairing",
    allowFrom: [],
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const serviceRef = useRef<WhatsAppChannelService | null>(null);
  const qrTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize service
  const service = useMemo(() => {
    if (!gatewayClient) return null;
    if (!serviceRef.current) {
      serviceRef.current = new WhatsAppChannelService(gatewayClient);
    }
    return serviceRef.current;
  }, [gatewayClient]);

  // Setup event listeners
  useEffect(() => {
    if (!service || !options?.enabled) return;

    const handleQr = (qr: string | null) => {
      if (qr) {
        setQrCode(qr);
        setConnecting(false);
        setError(null);
      } else {
        setQrCode(null);
      }
    };

    const handleConnected = (isConnected: boolean) => {
      setConnected(isConnected);
      if (isConnected) {
        setQrCode(null);
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

    service.on("qr", handleQr);
    service.on("connected", handleConnected);
    service.on("error", handleError);

    return () => {
      service.off("qr");
      service.off("connected");
      service.off("error");
    };
  }, [service, options?.enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
      }
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
      console.error("Failed to load WhatsApp config:", err);
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
    async (connectConfig?: Partial<WhatsAppConfig>) => {
      if (!service) {
        setError("Gateway client not available");
        return;
      }

      setConnecting(true);
      setError(null);
      setQrCode(null);

      // Clear any existing timeout
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
      }

      // Set timeout for QR code generation
      qrTimeoutRef.current = setTimeout(() => {
        if (!connected && !qrCode) {
          setError("QR code generation timed out. Please try again.");
          setConnecting(false);
        }
      }, 15000);

      try {
        await service.connect(connectConfig);
      } catch (err: any) {
        setError(err.message || "Failed to connect WhatsApp");
        setConnecting(false);
        if (qrTimeoutRef.current) {
          clearTimeout(qrTimeoutRef.current);
          qrTimeoutRef.current = null;
        }
      }
    },
    [service, connected, qrCode]
  );

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!service) return;
    try {
      await service.disconnect();
      setConnected(false);
      setQrCode(null);
    } catch (err: any) {
      setError(err.message || "Failed to disconnect WhatsApp");
    }
  }, [service]);

  // Save config
  const saveConfig = useCallback(
    async (updates: Partial<WhatsAppConfig>, immediate = false) => {
      if (!service) return;
      setSavingConfig(true);
      try {
        const newConfig = { ...config, ...updates };
        await service.saveConfig(newConfig, immediate);
        setConfig(newConfig);
      } catch (err: any) {
        setError(err.message || "Failed to save WhatsApp config");
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
    setQrCode(null);
    setError(null);
    if (qrTimeoutRef.current) {
      clearTimeout(qrTimeoutRef.current);
      qrTimeoutRef.current = null;
    }
  }, []);

  return {
    connected,
    connecting,
    qrCode,
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
