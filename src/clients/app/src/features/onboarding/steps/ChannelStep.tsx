import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, AlertCircle, QrCode, MessageSquare } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { OnboardingState } from "../onboarding-flow";
import { GatewayClient } from "../../../core/gateway/client";

type ChannelType = "whatsapp" | "telegram" | "discord" | "slack" | "signal" | "imessage" | "none";

interface ChannelStepProps {
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
  gatewayClient: GatewayClient | null;
}

export function ChannelStep({
  state,
  onUpdate,
  onNext,
  onBack,
  gatewayClient,
}: ChannelStepProps) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>(
    (state.channel?.type as ChannelType) || "none"
  );
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for QR code and connection events from gateway
  useEffect(() => {
    const handleQrEvent = (e: CustomEvent<{ qr: string; channelId: string }>) => {
      if (e.detail.channelId === "whatsapp" && selectedChannel === "whatsapp") {
        setQrCode(e.detail.qr);
        setConnecting(false);
      }
    };

    const handleConnectionEvent = (e: CustomEvent<{ connected: boolean; channelId: string }>) => {
      if (e.detail.channelId === "whatsapp" && selectedChannel === "whatsapp") {
        if (e.detail.connected) {
          setConnected(true);
          setQrCode(null);
          setConnecting(false);
          onUpdate({
            channel: {
              type: "whatsapp",
              connected: true,
              qrCode: null,
            },
          });
        }
      }
    };

    window.addEventListener("whatsapp-qr", handleQrEvent as EventListener);
    window.addEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
    return () => {
      window.removeEventListener("whatsapp-qr", handleQrEvent as EventListener);
      window.removeEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
    };
  }, [selectedChannel, onUpdate]);

  const handleChannelSelect = (channel: ChannelType) => {
    setSelectedChannel(channel);
    setConnected(false);
    setQrCode(null);
    setError(null);
    onUpdate({
      channel: {
        type: channel,
        connected: false,
        qrCode: null,
      },
    });
  };

  const handleConnect = async () => {
    if (!gatewayClient || selectedChannel === "none") return;

    setConnecting(true);
    setError(null);

    try {
      // Ensure gateway is connected
      if (!gatewayClient.isConnected()) {
        await gatewayClient.connect();
      }

      if (selectedChannel === "whatsapp") {
        try {
          // First, enable WhatsApp in config
          const configResponse = await gatewayClient.request("config.update", {
            updates: {
              channels: {
                whatsapp: {
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

          // Reload channels to pick up the new config
          const reloadResponse = await gatewayClient.request("channels.reload", {}) as {
            ok: boolean;
            error?: { message: string };
          };

          if (!reloadResponse.ok) {
            throw new Error(reloadResponse.error?.message || "Failed to reload channels");
          }

          // Now start WhatsApp channel
          const startResponse = await gatewayClient.request("channels.start", {
            channelId: "whatsapp",
          }) as { ok: boolean; error?: { message: string } };

          if (!startResponse.ok) {
            throw new Error(startResponse.error?.message || "Failed to start WhatsApp");
          }

          // For WhatsApp, QR code will be received via WebSocket event
          // Set pending state - QR code will come through event listener
          setQrCode("pending");
          setConnecting(false); // QR generation happens asynchronously
        } catch (err: any) {
          setError(err.message || "Failed to connect WhatsApp");
          setConnecting(false);
        }
      } else {
        // For other channels, mark as configured (they'll need tokens later)
        setConnected(true);
        onUpdate({
          channel: {
            type: selectedChannel,
            connected: true,
            qrCode: null,
          },
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect channel");
      setConnecting(false);
    } finally {
      setConnecting(false);
    }
  };

  const handleSkip = () => {
    onUpdate({
      channel: {
        type: "none",
        connected: false,
        qrCode: null,
      },
    });
    onNext();
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#c9d1d9] mb-2">
          Connect Chat Channel
        </h1>
        <p className="text-[#8b949e]">
          Select how you want to chat with your agent. You can add more channels later in settings.
        </p>
      </div>

      <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <h2 className="text-base font-semibold text-[#c9d1d9]">Channel Selection</h2>
          <p className="text-xs text-[#8b949e] mt-1">
            Choose your preferred messaging platform
          </p>
        </div>
        <div className="p-6 bg-[#0d1117]">
          <RadioGroup
            value={selectedChannel}
            onValueChange={(value) => handleChannelSelect(value as ChannelType)}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "whatsapp" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="whatsapp" id="whatsapp" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </div>
                <div className="text-xs text-[#8b949e]">
                  Standard mobile messaging. Requires QR pairing.
                </div>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "telegram" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="telegram" id="telegram" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Telegram
                </div>
                <div className="text-xs text-[#8b949e]">
                  Fast and bot-friendly. Setup in settings.
                </div>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "discord" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="discord" id="discord" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Discord
                </div>
                <div className="text-xs text-[#8b949e]">
                  Great for community chats. Setup in settings.
                </div>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "none" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="none" id="none" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9]">Skip for now</div>
                <div className="text-xs text-[#8b949e]">
                  Don't connect a channel during setup.
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>
      </div>

      {selectedChannel !== "none" && (
        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-base font-semibold text-[#c9d1d9]">Channel Connection</h2>
            <p className="text-xs text-[#8b949e] mt-1">
              {selectedChannel === "whatsapp" 
                ? "Scan the QR code to link your account" 
                : `Complete ${selectedChannel} setup in settings after onboarding`}
            </p>
          </div>
          <div className="p-6 space-y-4 bg-[#0d1117]">
            {selectedChannel === "whatsapp" && (
              <div className="space-y-4">
                {qrCode === "pending" && (
                  <div className="flex items-center gap-3 p-4 bg-[#161b22] rounded-md border border-[#30363d] border-dashed">
                    <Loader2 className="h-5 w-5 text-[#58a6ff] animate-spin" />
                    <span className="text-sm text-[#8b949e]">Generating QR Code...</span>
                  </div>
                )}

                {qrCode && qrCode !== "pending" && (
                  <div className="flex flex-col items-center gap-6 p-6 bg-[#161b22] rounded-md border border-[#30363d]">
                    <div className="text-center space-y-2">
                      <div className="font-semibold text-sm text-[#c9d1d9]">Pair with WhatsApp</div>
                      <div className="text-xs text-[#8b949e] max-w-[300px]">
                        Open WhatsApp → Linked Devices → Link a Device.
                      </div>
                    </div>
                    <div className="p-4 bg-white rounded-lg">
                      <QRCodeSVG value={qrCode} size={200} level="M" />
                    </div>
                    {connecting && (
                      <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Detecting scan...</span>
                      </div>
                    )}
                  </div>
                )}

                {connected && (
                  <div className="flex items-center gap-2 text-sm text-[#3fb950] p-4 bg-[#238636]/5 border border-[#238636]/20 rounded-md">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Successfully connected to WhatsApp</span>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 text-sm text-[#f85149] p-4 bg-[#f85149]/5 border border-[#f85149]/20 rounded-md">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold">Connection failed</div>
                      <div className="text-xs opacity-80">{error}</div>
                    </div>
                  </div>
                )}

                {!connected && !qrCode && (
                  <Button
                    onClick={handleConnect}
                    disabled={connecting || !gatewayClient}
                    className="w-full bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]"
                  >
                    {connecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Initializing...
                      </>
                    ) : (
                      <>
                        <QrCode className="mr-2 h-4 w-4" />
                        Generate QR Code
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {selectedChannel !== "whatsapp" && (
              <div className="p-4 bg-[#161b22] rounded-md border border-[#30363d] text-sm text-[#8b949e]">
                {selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)} integration will be configured later in the main settings dashboard. You can continue with the onboarding.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-6 border-t border-[#30363d]">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="text-[#8b949e] hover:text-[#c9d1d9]"
        >
          Back
        </Button>
        {selectedChannel === "none" ? (
          <Button 
            onClick={handleSkip}
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
          >
            Continue
          </Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={!connected && selectedChannel === "whatsapp"}
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
          >
            Next Step
          </Button>
        )}
      </div>
    </div>
  );
}
