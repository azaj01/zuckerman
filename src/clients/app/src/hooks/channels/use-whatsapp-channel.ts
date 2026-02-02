import { useState, useEffect, useCallback, useRef } from "react";
import { useWhatsAppService } from "../../core/gateway/use-services";
import { useGatewayContext } from "../../core/gateway/use-gateway-context";
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
  options?: { enabled?: boolean }
): UseWhatsAppChannelReturn {
  const { gatewayClient } = useGatewayContext();
  const whatsappService = useWhatsAppService();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<WhatsAppConfig>({
    dmPolicy: "pairing",
    allowFrom: [],
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const qrTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const service = whatsappService;

  // Setup event listeners (always register when service exists, not just when enabled)
  useEffect(() => {
    if (!service) return;

    const handleStatus = (statusObj: {
      status: "connected" | "connecting" | "disconnected" | "waiting_for_scan";
      qr?: string | null;
    }) => {
      console.log("[useWhatsAppChannel] Status update:", statusObj.status, statusObj.qr ? `with QR (length: ${statusObj.qr.length})` : "no QR");
      
      const { status, qr } = statusObj;
      
      // Update QR code state
      setQrCode(qr ?? null);
      
      // Update connection state based on status
      if (status === "connected") {
        setConnected(true);
        setConnecting(false);
        // Clear timeout when connected
        if (qrTimeoutRef.current) {
          clearTimeout(qrTimeoutRef.current);
          qrTimeoutRef.current = null;
        }
        setError(null);
        // Load config after connection
        setTimeout(() => {
          loadConfig();
        }, 500);
      } else if (status === "connecting") {
        setConnecting(true);
        setConnected(false);
        setError(null);
      } else if (status === "waiting_for_scan") {
        // Clear timeout when QR code is received
        if (qrTimeoutRef.current) {
          clearTimeout(qrTimeoutRef.current);
          qrTimeoutRef.current = null;
        }
        setConnecting(false);
        setConnected(false);
        setError(null);
      } else if (status === "disconnected") {
        setConnected(false);
        setConnecting(false);
      }
    };

    const handleError = (err: string) => {
      // Clear timeout on error
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
        qrTimeoutRef.current = null;
      }
      setError(err);
      setConnecting(false);
    };

    service.on("status", handleStatus);
    service.on("error", handleError);

    return () => {
      service.off("status");
      service.off("error");
    };
  }, [service]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
      }
      // Service is managed by GatewayProvider, no need to destroy here
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
  }, [options?.enabled, service, gatewayClient, loadConfig]);

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
