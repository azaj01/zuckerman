import React from "react";
import { useParams } from "react-router-dom";
import { AgentView } from "./agent-view";
import { GatewayClient } from "../../../core/gateway/client";
import type { UseAppReturn } from "../../../hooks/use-app";

interface AgentPageProps {
  state: UseAppReturn;
  gatewayClient: GatewayClient | null;
  onClose: () => void;
}

export function AgentPage({ state, gatewayClient, onClose }: AgentPageProps) {
  const { agentId } = useParams<{ agentId: string }>();

  if (!agentId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground mb-2">Agent not found</h2>
          <p className="text-sm text-muted-foreground">Please select an agent from the sidebar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden" style={{ minHeight: 0 }}>
      <AgentView
        agentId={agentId}
        state={state}
        gatewayClient={gatewayClient}
        onClose={onClose}
      />
    </div>
  );
}
