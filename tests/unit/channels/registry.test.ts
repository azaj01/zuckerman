import { describe, it, expect, beforeEach } from "vitest";
import { ChannelRegistry } from "@server/world/communication/messengers/channels/registry.js";
import { TelegramChannel } from "@server/world/communication/messengers/channels/telegram.js";
import { DiscordChannel } from "@server/world/communication/messengers/channels/discord.js";
import { SignalChannel } from "@server/world/communication/messengers/channels/signal.js";
import type { TelegramConfig, DiscordConfig, SignalConfig } from "@server/world/config/types.js";

describe("ChannelRegistry", () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  describe("register", () => {
    it("should register a channel", () => {
      const config: TelegramConfig = {
        enabled: true,
        botToken: "test-token",
      };
      const channel = new TelegramChannel(config);
      
      registry.register(channel, {
        id: "telegram",
        type: "telegram",
        enabled: true,
        config: config as Record<string, unknown>,
      });

      expect(registry.get("telegram")).toBe(channel);
    });

    it("should register multiple channels", () => {
      const telegramConfig: TelegramConfig = { enabled: true, botToken: "test-token" };
      const discordConfig: DiscordConfig = { enabled: true, token: "test-token" };
      
      const telegramChannel = new TelegramChannel(telegramConfig);
      const discordChannel = new DiscordChannel(discordConfig);

      registry.register(telegramChannel, {
        id: "telegram",
        type: "telegram",
        enabled: true,
        config: telegramConfig as Record<string, unknown>,
      });

      registry.register(discordChannel, {
        id: "discord",
        type: "discord",
        enabled: true,
        config: discordConfig as Record<string, unknown>,
      });

      expect(registry.get("telegram")).toBe(telegramChannel);
      expect(registry.get("discord")).toBe(discordChannel);
      expect(registry.list().length).toBe(2);
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent channel", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should return registered channel", () => {
      const config: TelegramConfig = { enabled: true, botToken: "test-token" };
      const channel = new TelegramChannel(config);
      
      registry.register(channel, {
        id: "telegram",
        type: "telegram",
        enabled: true,
        config: config as Record<string, unknown>,
      });

      expect(registry.get("telegram")).toBe(channel);
    });
  });

  describe("list", () => {
    it("should return empty array when no channels registered", () => {
      expect(registry.list()).toEqual([]);
    });

    it("should return all registered channels", () => {
      const telegramConfig: TelegramConfig = { enabled: true, botToken: "test-token" };
      const signalConfig: SignalConfig = { enabled: true };
      
      const telegramChannel = new TelegramChannel(telegramConfig);
      const signalChannel = new SignalChannel(signalConfig);

      registry.register(telegramChannel, {
        id: "telegram",
        type: "telegram",
        enabled: true,
        config: telegramConfig as Record<string, unknown>,
      });

      registry.register(signalChannel, {
        id: "signal",
        type: "signal",
        enabled: true,
        config: signalConfig as Record<string, unknown>,
      });

      const channels = registry.list();
      expect(channels.length).toBe(2);
      expect(channels).toContain(telegramChannel);
      expect(channels).toContain(signalChannel);
    });
  });

  describe("getConfig", () => {
    it("should return channel config", () => {
      const config: TelegramConfig = { enabled: true, botToken: "test-token" };
      const channel = new TelegramChannel(config);
      
      registry.register(channel, {
        id: "telegram",
        type: "telegram",
        enabled: true,
        config: config as Record<string, unknown>,
      });

      const retrievedConfig = registry.getConfig("telegram");
      expect(retrievedConfig).toBeDefined();
      expect(retrievedConfig?.id).toBe("telegram");
      expect(retrievedConfig?.type).toBe("telegram");
      expect(retrievedConfig?.enabled).toBe(true);
    });

    it("should return undefined for non-existent channel config", () => {
      expect(registry.getConfig("nonexistent")).toBeUndefined();
    });
  });

  describe("startAll", () => {
    it("should start all registered channels", async () => {
      const telegramConfig: TelegramConfig = { enabled: false }; // Disabled to avoid actual connection
      const signalConfig: SignalConfig = { enabled: true };
      
      const telegramChannel = new TelegramChannel(telegramConfig);
      const signalChannel = new SignalChannel(signalConfig);

      registry.register(telegramChannel, {
        id: "telegram",
        type: "telegram",
        enabled: false,
        config: telegramConfig as Record<string, unknown>,
      });

      registry.register(signalChannel, {
        id: "signal",
        type: "signal",
        enabled: true,
        config: signalConfig as Record<string, unknown>,
      });

      // Should not throw
      await expect(registry.startAll()).resolves.not.toThrow();
    });

    it("should handle errors gracefully", async () => {
      const config: SignalConfig = { enabled: true };
      const channel = new SignalChannel(config);

      registry.register(channel, {
        id: "signal",
        type: "signal",
        enabled: true,
        config: config as Record<string, unknown>,
      });

      // Should not throw even if channel start fails
      await expect(registry.startAll()).resolves.not.toThrow();
    });
  });

  describe("stopAll", () => {
    it("should stop all registered channels", async () => {
      const signalConfig: SignalConfig = { enabled: true };
      const channel = new SignalChannel(signalConfig);

      registry.register(channel, {
        id: "signal",
        type: "signal",
        enabled: true,
        config: signalConfig as Record<string, unknown>,
      });

      // Start first
      await channel.start();

      // Should not throw
      await expect(registry.stopAll()).resolves.not.toThrow();
    });
  });

  describe("clear", () => {
    it("should clear all channels", () => {
      const config: TelegramConfig = { enabled: true, botToken: "test-token" };
      const channel = new TelegramChannel(config);
      
      registry.register(channel, {
        id: "telegram",
        type: "telegram",
        enabled: true,
        config: config as Record<string, unknown>,
      });

      expect(registry.list().length).toBe(1);

      registry.clear();

      expect(registry.list().length).toBe(0);
      expect(registry.get("telegram")).toBeUndefined();
    });
  });
});
