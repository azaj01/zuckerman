import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../features/home/settings/settings-page";
import { useApp } from "../hooks/use-app";

export const Route = createFileRoute("/app/settings")({
  component: () => {
    const app = useApp();
    return (
      <SettingsPage
        gatewayClient={app.gatewayClient}
        onClose={() => app.handleSidebarAction("navigate-home", {})}
      />
    );
  },
});
