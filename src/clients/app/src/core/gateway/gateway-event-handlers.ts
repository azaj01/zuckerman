/**
 * Gateway event handlers for common events
 * Single Responsibility: Handle gateway events and dispatch to window
 */
export class GatewayEventHandlers {
  /**
   * Create standard event handlers for React state management
   */
  static createStateHandlers(handlers: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
  }) {
    return {
      onConnect: handlers.onConnect,
      onDisconnect: handlers.onDisconnect,
      onError: handlers.onError,
      onEvent: (event: any) => {
        // Handle channel events (e.g., WhatsApp status)
        if (event.event === "channel.whatsapp.status" && event.payload) {
          const payload = event.payload as {
            status: "connected" | "connecting" | "disconnected" | "waiting_for_scan";
            qr?: string | null;
            channelId: string;
          };
          console.log("[GatewayEventHandlers] Dispatching whatsapp-status event:", payload.status, payload.qr ? "with QR" : "no QR");
          window.dispatchEvent(new CustomEvent("whatsapp-status", { detail: payload }));
        } else if (event.event === "channel.telegram.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("telegram-connection", { detail: payload }));
        } else if (event.event === "channel.discord.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("discord-connection", { detail: payload }));
        } else if (event.event === "channel.signal.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("signal-connection", { detail: payload }));
        }
      },
    };
  }
}
