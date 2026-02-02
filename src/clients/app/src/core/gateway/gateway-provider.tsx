import React, { useMemo, useEffect, useRef, useState, ReactNode } from "react";
import type { GatewayClient } from "./client";
import { gatewayService } from "./gateway-service";
import { serviceRegistry } from "./service-registry";
import { GatewayContext, type ConnectionStatus } from "./gateway-context";
import { GatewayClientFactory } from "./gateway-client-factory";
import { GatewayEventHandlers } from "./gateway-event-handlers";

interface GatewayProviderProps {
  children: ReactNode;
}

/**
 * GatewayProvider - Single source of truth for gateway client and connection state
 * 
 * Responsibilities:
 * - Creates and manages GatewayClient instance
 * - Tracks connection status via event handlers (no polling)
 * - Manages service registry per client instance
 * - Provides gateway context to all children
 * - Auto-initializes gateway service with Electron API
 */
export function GatewayProvider({ children }: GatewayProviderProps) {
  const [gatewayClient, setGatewayClient] = useState<GatewayClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const previousClientRef = useRef<GatewayClient | null>(null);

  // Initialize gateway service with Electron API and auto-start if enabled
  useEffect(() => {
    if (!window.electronAPI) {
      console.warn("[GatewayProvider] electronAPI not available, skipping gateway start");
      return;
    }

    gatewayService.initialize(window.electronAPI);

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

    const isExplicitlyStopped = localStorage.getItem("zuckerman:gateway:explicitly-stopped") === "true";

    // Only auto-start if enabled and not explicitly stopped
    if (autoStart && !isExplicitlyStopped) {
      gatewayService.ensureRunning().then((result) => {
        if (result.success) {
          if (result.alreadyRunning) {
            console.log("[GatewayProvider] Gateway was already running");
          } else {
            console.log("[GatewayProvider] Gateway started successfully");
          }
        } else {
          const errorMsg = result.error || "Failed to start gateway";
          console.warn("[GatewayProvider] Gateway startup issue (non-critical):", errorMsg);
        }
      }).catch((err) => {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.warn("[GatewayProvider] Gateway startup error (non-critical):", errorMessage);
      });
    } else {
      console.log("[GatewayProvider] Skipping auto-start (autoStart disabled or explicitly stopped)");
    }
  }, []);

  // Create gateway client with event handlers for connection status and channel events
  useEffect(() => {
    const stateHandlers = GatewayEventHandlers.createStateHandlers({
      onConnect: () => {
        console.log("[GatewayProvider] Connection established");
        setConnectionStatus("connected");
      },
      onDisconnect: () => {
        console.log("[GatewayProvider] Connection lost");
        setConnectionStatus("disconnected");
      },
      onError: (error) => {
        console.error("[GatewayProvider] Connection error:", error);
        setConnectionStatus("disconnected");
      },
    });

    const client = GatewayClientFactory.createWithStateHandlers(stateHandlers);

    // Set initial connection status
    setConnectionStatus(client.isConnected() ? "connected" : "disconnected");
    setGatewayClient(client);

    return () => {
      client.disconnect();
    };
  }, []);

  // Cleanup services when gateway client changes
  useEffect(() => {
    const previousClient = previousClientRef.current;
    
    // If client changed, clear old client's services
    if (previousClient && previousClient !== gatewayClient) {
      serviceRegistry.clear(previousClient);
    }

    // Update ref
    previousClientRef.current = gatewayClient;

    // Cleanup on unmount
    return () => {
      if (gatewayClient) {
        serviceRegistry.clear(gatewayClient);
      }
    };
  }, [gatewayClient]);

  const value = useMemo(
    () => ({
      gatewayClient,
      connectionStatus,
      gatewayService,
      serviceRegistry,
    }),
    [gatewayClient, connectionStatus]
  );

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}
