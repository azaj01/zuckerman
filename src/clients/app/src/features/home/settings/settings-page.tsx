import React from "react";
import { SettingsView } from "./settings-view";
import { GatewayClient } from "../../../core/gateway/client";

interface SettingsPageProps {
  gatewayClient: GatewayClient | null;
  onClose: () => void;
}

export function SettingsPage({
  gatewayClient,
  onClose,
}: SettingsPageProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      <SettingsView
        gatewayClient={gatewayClient}
        onClose={onClose}
      />
    </div>
  );
}
