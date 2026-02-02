import { useContext } from "react";
import { GatewayContext, type GatewayContextValue } from "./gateway-provider";

/**
 * Hook to access gateway context
 */
export function useGatewayContext(): GatewayContextValue {
  const context = useContext(GatewayContext);
  if (!context) {
    throw new Error("useGatewayContext must be used within GatewayProvider");
  }
  return context;
}
