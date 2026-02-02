import { createContext } from "react";
import type { GatewayClient } from "./client";
import { gatewayService } from "./gateway-service";
import { serviceRegistry, type ServiceRegistry } from "./service-registry";

export type ConnectionStatus = "connected" | "disconnected" | "connecting";

export interface GatewayContextValue {
  gatewayClient: GatewayClient | null;
  connectionStatus: ConnectionStatus;
  gatewayService: typeof gatewayService;
  serviceRegistry: ServiceRegistry;
}

export const GatewayContext = createContext<GatewayContextValue>({
  gatewayClient: null,
  connectionStatus: "disconnected",
  gatewayService: gatewayService,
  serviceRegistry: serviceRegistry,
});
