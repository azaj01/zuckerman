import { useState, useEffect, useCallback } from "react";
import { useAgentService } from "../core/gateway/use-services";
import { useGatewayContext } from "../core/gateway/use-gateway-context";

export interface UseAgentsReturn {
  agents: string[];
  currentAgentId: string | null;
  setCurrentAgentId: (agentId: string | null) => void;
  loadAgents: () => Promise<void>;
}

/**
 * Hook for managing agents
 * Always uses the gateway client from context
 * Reacts to connection status changes
 */
export function useAgents(): UseAgentsReturn {
  const { gatewayClient, connectionStatus } = useGatewayContext();
  const agentService = useAgentService();

  const [agents, setAgents] = useState<string[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    if (connectionStatus !== "connected" || !agentService) {
      console.log("[Agents] Gateway not connected or service not available, skipping agent load", {
        connectionStatus,
        hasService: !!agentService
      });
      return;
    }

    try {
      console.log("[Agents] Loading agents...");
      const loadedAgents = await agentService.listAgents();
      console.log("[Agents] Loaded agents:", loadedAgents);
      setAgents(loadedAgents);

      // Auto-select first agent if none selected or current selection is invalid
      setCurrentAgentId((prevAgentId) => {
        if (loadedAgents.length > 0) {
          if (!prevAgentId || !loadedAgents.includes(prevAgentId)) {
            console.log("[Agents] Auto-selecting first agent:", loadedAgents[0]);
            return loadedAgents[0];
          }
        }
        return prevAgentId;
      });
    } catch (error) {
      console.error("[Agents] Failed to load agents:", error);
    }
  }, [connectionStatus, agentService]);

  // React to connection status changes
  useEffect(() => {
    if (connectionStatus === "connected" && agentService) {
      // Small delay to ensure connection is fully established
      const timeoutId = setTimeout(() => {
        loadAgents().catch((error) => {
          console.error("[Agents] Failed to load agents after connection:", error);
        });
      }, 100);
      return () => clearTimeout(timeoutId);
    } else if (connectionStatus === "disconnected") {
      // Clear agents when disconnected
      setAgents([]);
      setCurrentAgentId(null);
    }
  }, [connectionStatus, agentService, loadAgents]);

  return {
    agents,
    currentAgentId,
    setCurrentAgentId,
    loadAgents,
  };
}
