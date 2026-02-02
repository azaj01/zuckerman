import React, { createContext, useMemo, useEffect, ReactNode } from "react";
import type { GatewayClient } from "./client";
import { gatewayService } from "./gateway-service";
import { WhatsAppChannelService } from "../channels/whatsapp-channel-service";
import { TelegramChannelService } from "../channels/telegram-channel-service";
import { DiscordChannelService } from "../channels/discord-channel-service";
import { SignalChannelService } from "../channels/signal-channel-service";

export interface GatewayContextValue {
  gatewayClient: GatewayClient | null;
  gatewayService: typeof gatewayService;
  whatsappService: WhatsAppChannelService | null;
  telegramService: TelegramChannelService | null;
  discordService: DiscordChannelService | null;
  signalService: SignalChannelService | null;
}

export const GatewayContext = createContext<GatewayContextValue>({
  gatewayClient: null,
  gatewayService: gatewayService,
  whatsappService: null,
  telegramService: null,
  discordService: null,
  signalService: null,
});

interface GatewayProviderProps {
  gatewayClient: GatewayClient | null;
  children: ReactNode;
}

/**
 * GatewayProvider - manages gateway client and channel service instances
 * 
 * Ensures singleton instances per gateway client:
 * - One GatewayClient instance
 * - One GatewayService instance (singleton, shared across all providers)
 * - One WhatsAppChannelService instance per GatewayClient
 * - One TelegramChannelService instance per GatewayClient
 * - One DiscordChannelService instance per GatewayClient
 * - One SignalChannelService instance per GatewayClient
 */
export function GatewayProvider({ gatewayClient, children }: GatewayProviderProps) {
  // Initialize gateway service with Electron API if available
  useEffect(() => {
    if (window.electronAPI) {
      gatewayService.initialize(window.electronAPI);
    }
  }, []);

  // Create service instances (one per gateway client, managed by provider)
  const services = useMemo(() => {
    if (!gatewayClient) {
      return {
        whatsappService: null,
        telegramService: null,
        discordService: null,
        signalService: null,
      };
    }

    return {
      whatsappService: new WhatsAppChannelService(gatewayClient),
      telegramService: new TelegramChannelService(gatewayClient),
      discordService: new DiscordChannelService(gatewayClient),
      signalService: new SignalChannelService(gatewayClient),
    };
  }, [gatewayClient]);

  const value = useMemo(
    () => ({
      gatewayClient,
      gatewayService,
      ...services,
    }),
    [gatewayClient, services]
  );

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}
