import { createFileRoute } from "@tanstack/react-router";
import { InspectorPage } from "../features/home/inspector-page";
import { useApp } from "../hooks/use-app";

export const Route = createFileRoute("/app/inspector")({
  component: () => {
    const app = useApp();
    return (
      <InspectorPage
        gatewayClient={app.gatewayClient}
        onClose={() => app.handleSidebarAction("navigate-home", {})}
      />
    );
  },
});
