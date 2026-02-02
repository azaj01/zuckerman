import { createContext } from "react";
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
