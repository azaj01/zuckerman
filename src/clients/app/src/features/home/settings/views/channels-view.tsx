import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, QrCode, MessageSquare, Power } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { GatewayClient } from "../../../../core/gateway/client";

type ChannelId = "whatsapp" | "telegram" | "discord" | "slack" | "signal" | "imessage";

interface ChannelStatus {
  id: string;
  type: string;
  connected: boolean;
}

interface ChannelState {
  qrCode: string | null;
  connecting: boolean;
  error: string | null;
}

interface ChannelsViewProps {
  gatewayClient: GatewayClient | null;
}

const CHANNEL_INFO: Record<ChannelId, { name: string; description: string; icon: React.ReactNode }> = {
  whatsapp: {
    name: "WhatsApp",
    description: "Standard mobile messaging. Requires QR pairing.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  telegram: {
    name: "Telegram",
    description: "Fast and bot-friendly. Setup requires bot token.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  discord: {
    name: "Discord",
    description: "Great for community chats. Setup requires bot token.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  slack: {
    name: "Slack",
    description: "Team collaboration. Setup requires bot token.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  signal: {
    name: "Signal",
    description: "Privacy-focused messaging. Coming soon.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  imessage: {
    name: "iMessage",
    description: "Apple Messages integration. Coming soon.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
};

export function ChannelsView({ gatewayClient }: ChannelsViewProps) {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelStates, setChannelStates] = useState<Record<string, ChannelState>>({});
  const qrTimeoutRefs = React.useRef<Record<string, NodeJS.Timeout | null>>({});
  const connectionPollIntervals = React.useRef<Record<string, NodeJS.Timeout | null>>({});

  // Load channel status
  const loadChannelStatus = React.useCallback(async () => {
    if (!gatewayClient || !gatewayClient.isConnected()) return;

    try {
      const statusResponse = await gatewayClient.request("channels.status", {}) as {
        ok: boolean;
        result?: { status?: ChannelStatus[] };
      };

      if (statusResponse.ok && statusResponse.result?.status) {
        setChannels(statusResponse.result.status);
      }
    } catch (err) {
      console.error("Failed to load channel status:", err);
    } finally {
      setLoading(false);
    }
  }, [gatewayClient]);

  useEffect(() => {
    loadChannelStatus();
  }, [loadChannelStatus]);

  // Helper to update channel state
  const updateChannelState = React.useCallback((channelId: string, updates: Partial<ChannelState>) => {
    setChannelStates((prev) => ({
      ...prev,
      [channelId]: { ...prev[channelId], ...updates },
    }));
  }, []);

  // Helper to clear timeouts/intervals for a channel
  const clearChannelTimers = React.useCallback((channelId: string) => {
    if (qrTimeoutRefs.current[channelId]) {
      clearTimeout(qrTimeoutRefs.current[channelId]!);
      qrTimeoutRefs.current[channelId] = null;
    }
    if (connectionPollIntervals.current[channelId]) {
      clearInterval(connectionPollIntervals.current[channelId]!);
      connectionPollIntervals.current[channelId] = null;
    }
  }, []);

  // Listen for WhatsApp events
  useEffect(() => {
    const handleQrEvent = (e: CustomEvent<{ qr: string; channelId: string }>) => {
      const channelId = e.detail.channelId;
      clearChannelTimers(channelId);
      updateChannelState(channelId, {
        qrCode: e.detail.qr,
        connecting: false,
        error: null,
      });

      // Start polling for connection (WhatsApp only for now)
      if (channelId === "whatsapp" && gatewayClient && gatewayClient.isConnected()) {
        let pollCount = 0;
        const maxPolls = 60;

        connectionPollIntervals.current[channelId] = setInterval(async () => {
          pollCount++;
          if (pollCount > maxPolls) {
            clearChannelTimers(channelId);
            return;
          }

          try {
            const statusResponse = await gatewayClient.request("channels.status", {}) as {
              ok: boolean;
              result?: { status?: ChannelStatus[] };
            };
            const channelStatus = statusResponse.result?.status?.find((s) => s.id === channelId);
            if (channelStatus?.connected) {
              updateChannelState(channelId, {
                qrCode: null,
                connecting: false,
                error: null,
              });
              clearChannelTimers(channelId);
              loadChannelStatus();
            }
          } catch (err) {
            console.debug("Error polling connection status:", err);
          }
        }, 2000);
      }
    };

    const handleConnectionEvent = (e: CustomEvent<{ connected: boolean; channelId: string }>) => {
      const channelId = e.detail.channelId;
      if (e.detail.connected) {
        updateChannelState(channelId, {
          qrCode: null,
          connecting: false,
          error: null,
        });
        clearChannelTimers(channelId);
        loadChannelStatus();
      }
    };

    window.addEventListener("whatsapp-qr", handleQrEvent as EventListener);
    window.addEventListener("whatsapp-connection", handleConnectionEvent as EventListener);

    return () => {
      window.removeEventListener("whatsapp-qr", handleQrEvent as EventListener);
      window.removeEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
      Object.keys(qrTimeoutRefs.current).forEach(clearChannelTimers);
      Object.keys(connectionPollIntervals.current).forEach(clearChannelTimers);
    };
  }, [gatewayClient, loadChannelStatus, clearChannelTimers, updateChannelState]);

  const handleChannelConnect = async (channelId: ChannelId) => {
    if (!gatewayClient || channelId !== "whatsapp") return; // Only WhatsApp supported for now

    updateChannelState(channelId, { connecting: true, error: null, qrCode: null });

    try {
      if (!gatewayClient.isConnected()) {
        await gatewayClient.connect();
      }

      // Enable channel in config
      const configResponse = await gatewayClient.request("config.update", {
        updates: {
          channels: {
            [channelId]: {
              enabled: true,
              dmPolicy: "pairing",
              allowFrom: [],
            },
          },
        },
      }) as { ok: boolean; error?: { message: string } };

      if (!configResponse.ok) {
        throw new Error(configResponse.error?.message || "Failed to update config");
      }

      // Reload channels
      const reloadResponse = await gatewayClient.request("channels.reload", {}) as {
        ok: boolean;
        error?: { message: string };
      };

      if (!reloadResponse.ok) {
        throw new Error(reloadResponse.error?.message || "Failed to reload channels");
      }

      // Start channel
      const startResponse = await gatewayClient.request("channels.start", {
        channelId,
      }) as { ok: boolean; error?: { message: string } };

      if (!startResponse.ok) {
        throw new Error(startResponse.error?.message || `Failed to start ${channelId}`);
      }

      // Check if already connected
      try {
        const statusResponse = await gatewayClient.request("channels.status", {}) as {
          ok: boolean;
          result?: { status?: ChannelStatus[] };
        };
        const channelStatus = statusResponse.result?.status?.find((s) => s.id === channelId);
        if (channelStatus?.connected) {
          updateChannelState(channelId, { connecting: false, qrCode: null });
          loadChannelStatus();
          return;
        }
      } catch {
        // Continue with QR code flow
      }

      // Wait for QR code (WhatsApp only)
      if (channelId === "whatsapp") {
        updateChannelState(channelId, { qrCode: "pending", connecting: false });

        qrTimeoutRefs.current[channelId] = setTimeout(() => {
          updateChannelState(channelId, {
            error: "QR code generation timed out. Please try again.",
            qrCode: null,
            connecting: false,
          });
        }, 15000);
      }
    } catch (err: any) {
      updateChannelState(channelId, {
        error: err.message || `Failed to connect ${channelId}`,
        connecting: false,
        qrCode: null,
      });
    }
  };

  const handleChannelDisconnect = async (channelId: ChannelId) => {
    if (!gatewayClient) return;

    try {
      const stopResponse = await gatewayClient.request("channels.stop", {
        channelId,
      }) as { ok: boolean; error?: { message: string } };

      if (!stopResponse.ok) {
        throw new Error(stopResponse.error?.message || `Failed to stop ${channelId}`);
      }

      // Disable channel in config
      await gatewayClient.request("config.update", {
        updates: {
          channels: {
            [channelId]: {
              enabled: false,
            },
          },
        },
      });

      // Reload channels
      await gatewayClient.request("channels.reload", {});

      clearChannelTimers(channelId);
      updateChannelState(channelId, { qrCode: null, connecting: false, error: null });
      loadChannelStatus();
    } catch (err: any) {
      updateChannelState(channelId, {
        error: err.message || `Failed to disconnect ${channelId}`,
      });
    }
  };

  const renderChannel = (channelId: ChannelId) => {
    const channel = channels.find((c) => c.id === channelId);
    const state = channelStates[channelId] || { qrCode: null, connecting: false, error: null };
    const info = CHANNEL_INFO[channelId];
    const isConnected = channel?.connected || false;
    const isWhatsApp = channelId === "whatsapp";

    return (
      <div key={channelId} className="border border-border rounded-md bg-card">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {info.icon}
              <div>
                <div className="font-semibold text-foreground">{info.name}</div>
                <div className="text-sm text-muted-foreground">{info.description}</div>
              </div>
            </div>
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleChannelDisconnect(channelId)}
                disabled={!gatewayClient}
              >
                <Power className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleChannelConnect(channelId)}
                disabled={state.connecting || !gatewayClient}
              >
                {state.connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : isWhatsApp ? (
                  <>
                    <QrCode className="h-4 w-4 mr-2" />
                    Connect
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Setup
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        <div className="px-6 py-4 space-y-4">
          {isConnected && !state.qrCode && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md">
              <CheckCircle2 className="h-4 w-4" />
              <span>Successfully connected</span>
            </div>
          )}

          {state.qrCode === "pending" && (
            <div className="flex items-center gap-3 p-4 bg-muted rounded-md border border-dashed">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Generating QR Code...</span>
            </div>
          )}

          {state.qrCode && state.qrCode !== "pending" && isWhatsApp && (
            <div className="flex flex-col items-center gap-4 p-6 bg-muted rounded-md border">
              <div className="text-center space-y-2">
                <div className="font-semibold text-sm">Pair with WhatsApp</div>
                <div className="text-xs text-muted-foreground max-w-[300px]">
                  Open WhatsApp → Linked Devices → Link a Device.
                </div>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <QRCodeSVG value={state.qrCode} size={200} level="M" />
              </div>
              {!isConnected && (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Waiting for scan...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {state.error && (
            <div className="flex items-start gap-2 text-sm text-destructive p-4 bg-destructive/5 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">Connection failed</div>
                <div className="text-xs opacity-80">{state.error}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const availableChannels: ChannelId[] = ["whatsapp", "telegram", "discord", "slack", "signal", "imessage"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Messaging Channels</CardTitle>
          <CardDescription>
            Connect messaging platforms to send and receive messages through your agent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading channel status...
            </div>
          ) : (
            <div className="space-y-4">
              {availableChannels.map(renderChannel)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
