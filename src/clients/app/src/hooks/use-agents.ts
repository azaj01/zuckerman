import { useState, useEffect, useCallback } from "react";
import type { GatewayClient } from "../core/gateway/client";
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
 */
export function useAgents(
  gatewayClient: GatewayClient | null
): UseAgentsReturn {
  const { gatewayClient: contextClient } = useGatewayContext();
  const agentService = useAgentService();

  // Use gatewayClient from context if not provided (for backward compatibility)
  const effectiveClient = gatewayClient || contextClient;

  const [agents, setAgents] = useState<string[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    if (!effectiveClient?.isConnected() || !agentService) {
      console.log("[Agents] Gateway not connected or service not available, skipping agent load");
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
  }, [effectiveClient, agentService]);

  useEffect(() => {
    if (effectiveClient?.isConnected() && agentService) {
      loadAgents();
    }
  }, [effectiveClient, agentService, loadAgents]);

  return {
    agents,
    currentAgentId,
    setCurrentAgentId,
    loadAgents,
  };
}
