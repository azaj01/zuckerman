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
  const qrTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isWaitingForQrRef = React.useRef(false);
  const connectionPollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Helper to clear QR timeout
  const clearQrTimeout = React.useCallback(() => {
    if (qrTimeoutRef.current) {
      clearTimeout(qrTimeoutRef.current);
      qrTimeoutRef.current = null;
    }
    isWaitingForQrRef.current = false;
  }, []);

  // Helper to stop connection polling
  const stopConnectionPolling = React.useCallback(() => {
    if (connectionPollIntervalRef.current) {
      clearInterval(connectionPollIntervalRef.current);
      connectionPollIntervalRef.current = null;
    }
  }, []);

  // Helper to reset WhatsApp state
  const resetWhatsAppState = React.useCallback(() => {
    clearQrTimeout();
    stopConnectionPolling();
    setQrCode(null);
    setConnecting(false);
    setError(null);
  }, [clearQrTimeout, stopConnectionPolling]);

  // Helper to mark as connected
  const markConnected = React.useCallback(() => {
    clearQrTimeout();
    stopConnectionPolling();
    setConnected(true);
    setQrCode(null);
    setConnecting(false);
    setError(null);
    onUpdate({
      channel: {
        type: "whatsapp",
        connected: true,
        qrCode: null,
      },
    });
  }, [clearQrTimeout, stopConnectionPolling, onUpdate]);

  // Listen for QR code and connection events from gateway
  useEffect(() => {
    if (selectedChannel !== "whatsapp") return;

    const handleQrEvent = (e: CustomEvent<{ qr: string; channelId: string }>) => {
      if (e.detail.channelId === "whatsapp") {
        clearQrTimeout();
        setQrCode(e.detail.qr);
        setConnecting(false);
        setError(null);
        isWaitingForQrRef.current = false;
        
        // Start polling for connection status after QR code is shown
        if (gatewayClient && gatewayClient.isConnected()) {
          stopConnectionPolling();
          let pollCount = 0;
          const maxPolls = 60; // Poll for max 2 minutes (60 * 2s)
          
          connectionPollIntervalRef.current = setInterval(async () => {
            pollCount++;
            
            // Stop polling after max attempts
            if (pollCount > maxPolls) {
              stopConnectionPolling();
              return;
            }
            
            try {
              const statusResponse = await gatewayClient.request("channels.status", {}) as {
                ok: boolean;
                result?: { status?: Array<{ id: string; connected: boolean }> };
              };
              
              if (!statusResponse.ok) {
                console.debug("[ChannelStep] Status check failed:", statusResponse);
                return;
              }
              
              const whatsappStatus = statusResponse.result?.status?.find((s) => s.id === "whatsapp");
              if (whatsappStatus?.connected) {
                markConnected();
              }
            } catch (err) {
              console.debug("[ChannelStep] Error polling connection status:", err);
            }
          }, 2000); // Poll every 2 seconds
        }
      }
    };

    const handleConnectionEvent = (e: CustomEvent<{ connected: boolean; channelId: string }>) => {
      console.log("[ChannelStep] Received whatsapp-connection event", e.detail);
      if (e.detail.channelId === "whatsapp") {
        if (e.detail.connected) {
          console.log("[ChannelStep] Marking WhatsApp as connected");
          markConnected();
        } else {
          console.log("[ChannelStep] WhatsApp disconnected");
          setConnected(false);
        }
      }
    };

    window.addEventListener("whatsapp-qr", handleQrEvent as EventListener);
    window.addEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
    
    return () => {
      window.removeEventListener("whatsapp-qr", handleQrEvent as EventListener);
      window.removeEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
      clearQrTimeout();
      stopConnectionPolling();
    };
  }, [selectedChannel, clearQrTimeout, markConnected, stopConnectionPolling, gatewayClient]);

  const handleChannelSelect = (channel: ChannelType) => {
    resetWhatsAppState();
    stopConnectionPolling();
    setSelectedChannel(channel);
    setConnected(false);
    onUpdate({
      channel: {
        type: channel,
        connected: false,
        qrCode: null,
      },
    });
  };

  // Connect WhatsApp channel
  const connectWhatsApp = React.useCallback(async (client: GatewayClient) => {
    // Enable WhatsApp in config
    const configResponse = await client.request("config.update", {
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
    const reloadResponse = await client.request("channels.reload", {}) as {
      ok: boolean;
      error?: { message: string };
    };

    if (!reloadResponse.ok) {
      throw new Error(reloadResponse.error?.message || "Failed to reload channels");
    }

    // Start WhatsApp channel
    const startResponse = await client.request("channels.start", {
      channelId: "whatsapp",
    }) as { ok: boolean; error?: { message: string } };

    if (!startResponse.ok) {
      throw new Error(startResponse.error?.message || "Failed to start WhatsApp");
    }

    // Check if already connected (credentials exist)
    try {
      const statusResponse = await client.request("channels.status", {}) as {
        ok: boolean;
        result?: { status?: Array<{ id: string; connected: boolean }> };
      };
      
      if (statusResponse.ok) {
        const whatsappStatus = statusResponse.result?.status?.find((s) => s.id === "whatsapp");
        if (whatsappStatus?.connected) {
          markConnected();
          return;
        }
      }
    } catch {
      // Continue with QR code flow if status check fails
    }

    // Wait for QR code via WebSocket event
    setQrCode("pending");
    setConnecting(false);
    isWaitingForQrRef.current = true;
    
    // Set timeout for QR code generation
    qrTimeoutRef.current = setTimeout(() => {
      if (isWaitingForQrRef.current) {
        setError("QR code generation timed out. Please try again.");
        resetWhatsAppState();
      }
    }, 15000);
  }, [markConnected, resetWhatsAppState]);

  const handleConnect = async () => {
    if (!gatewayClient || selectedChannel === "none") return;

    setConnecting(true);
    setError(null);
    clearQrTimeout();

    try {
      // Ensure gateway is connected
      if (!gatewayClient.isConnected()) {
        await gatewayClient.connect();
      }

      if (selectedChannel === "whatsapp") {
        await connectWhatsApp(gatewayClient);
      } else {
        // For other channels, mark as configured
        setConnected(true);
        setConnecting(false);
        onUpdate({
          channel: {
            type: selectedChannel,
            connected: true,
            qrCode: null,
          },
        });
      }
    } catch (err: any) {
      resetWhatsAppState();
      setError(err.message || "Failed to connect channel");
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
                    {!connected && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Waiting for scan...</span>
                        </div>
                        <div className="text-xs text-[#8b949e] opacity-70">
                          Scan the QR code above with your WhatsApp app
                        </div>
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
