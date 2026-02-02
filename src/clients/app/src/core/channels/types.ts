import type { GatewayClient } from "../gateway/client";

export type ChannelId = "whatsapp" | "telegram" | "discord" | "slack" | "signal" | "imessage";

export interface ChannelStatus {
  id: string;
  type: string;
  connected: boolean;
}

export interface WhatsAppConfig {
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
}

export interface TelegramConfig {
  botToken?: string;
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
}

export interface DiscordConfig {
  token?: string;
  dm?: {
    enabled?: boolean;
    policy?: "open" | "pairing" | "allowlist";
    allowFrom?: string[];
  };
  guilds?: Record<string, {
    slug?: string;
    requireMention?: boolean;
    channels?: Record<string, { allow?: boolean; requireMention?: boolean }>;
  }>;
}

export interface SignalConfig {
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
}

export interface ChannelConnectionState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  qrCode: string | null;
}

export interface ChannelServiceEvents {
  qr: (qr: string | null) => void;
  connected: (connected: boolean) => void;
  error: (error: string) => void;
}
