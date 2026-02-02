import React, { createContext, useMemo, useEffect, useRef, ReactNode } from "react";
import type { GatewayClient } from "./client";
import { gatewayService } from "./gateway-service";
import { serviceRegistry, type ServiceRegistry } from "./service-registry";

export interface GatewayContextValue {
  gatewayClient: GatewayClient | null;
  gatewayService: typeof gatewayService;
  serviceRegistry: ServiceRegistry;
}

export const GatewayContext = createContext<GatewayContextValue>({
  gatewayClient: null,
  gatewayService: gatewayService,
  serviceRegistry: serviceRegistry,
});

interface GatewayProviderProps {
  gatewayClient: GatewayClient | null;
  children: ReactNode;
}

/**
 * GatewayProvider - manages gateway client and service registry
 * 
 * Ensures singleton instances per gateway client via ServiceRegistry:
 * - One GatewayClient instance
 * - One GatewayService instance (singleton, shared across all providers)
 * - ServiceRegistry manages all services (channels + core) per GatewayClient
 * - Services are created lazily on first access
 * - Services are cleaned up when client changes or provider unmounts
 */
export function GatewayProvider({ gatewayClient, children }: GatewayProviderProps) {
  const previousClientRef = useRef<GatewayClient | null>(null);

  // Initialize gateway service with Electron API if available
  useEffect(() => {
    if (window.electronAPI) {
      gatewayService.initialize(window.electronAPI);
    }
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
      gatewayService,
      serviceRegistry,
    }),
    [gatewayClient]
  );

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}
