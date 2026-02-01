import { useState, useEffect, useCallback } from "react";
import type { GatewayClient } from "../core/gateway/client";
import { AgentService } from "../core/agents/agent-service";

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
  const [agents, setAgents] = useState<string[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    if (!gatewayClient?.isConnected()) {
      console.log("[Agents] Gateway not connected, skipping agent load");
      return;
    }

    try {
      console.log("[Agents] Loading agents...");
      const service = new AgentService(gatewayClient);
      const loadedAgents = await service.listAgents();
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
  }, [gatewayClient]);

  useEffect(() => {
    if (gatewayClient?.isConnected()) {
      loadAgents();
    }
  }, [gatewayClient, loadAgents]);

  return {
    agents,
    currentAgentId,
    setCurrentAgentId,
    loadAgents,
  };
}
