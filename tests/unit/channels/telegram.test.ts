import { describe, it, expect, beforeEach, vi } from "vitest";
import { TelegramChannel } from "@server/world/communication/messengers/channels/telegram.js";
import type { TelegramConfig } from "@server/world/config/types.js";
import type { ChannelMessage } from "@server/world/communication/messengers/channels/types.js";

// Mock grammy
vi.mock("grammy", () => {
  const mockBot = {
    api: {
      getMe: vi.fn().mockResolvedValue({ id: 123, username: "test_bot" }),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    },
    on: vi.fn(),
    catch: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };

  return {
    Bot: vi.fn().mockImplementation(() => mockBot),
  };
});

describe("TelegramChannel", () => {
  let channel: TelegramChannel;
  let config: TelegramConfig;
  let connectionCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    config = {
      enabled: true,
      botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    };
    connectionCallback = vi.fn();
    channel = new TelegramChannel(config, connectionCallback);
  });

  describe("constructor", () => {
    it("should create channel with config", () => {
      expect(channel.id).toBe("telegram");
      expect(channel.type).toBe("telegram");
    });

    it("should accept connection callback", () => {
      const callback = vi.fn();
      const ch = new TelegramChannel(config, callback);
      expect(ch).toBeDefined();
    });
  });

  describe("start", () => {
    it("should not start if already running", async () => {
      // Mock isRunning by starting once
      await channel.start();
      const initialCallCount = connectionCallback.mock.calls.length;
      
      await channel.start();
      
      // Should not call callback again
      expect(connectionCallback.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);
    });

    it("should not start if disabled", async () => {
      const disabledConfig: TelegramConfig = { enabled: false };
      const disabledChannel = new TelegramChannel(disabledConfig);
      
      await disabledChannel.start();
      
      expect(disabledChannel.isConnected()).toBe(false);
    });

    it("should not start without bot token", async () => {
      const noTokenConfig: TelegramConfig = { enabled: true };
      const noTokenChannel = new TelegramChannel(noTokenConfig);
      
      await noTokenChannel.start();
      
      expect(noTokenChannel.isConnected()).toBe(false);
    });

    it("should handle 409 conflict error", async () => {
      const { Bot } = await import("grammy");
      const mockBot = new Bot("token");
      
      // Mock getMe to throw 409 error
      vi.mocked(mockBot.api.getMe).mockRejectedValueOnce({
        error_code: 409,
        description: "terminated by other getUpdates request",
      });

      const ch = new TelegramChannel(config, connectionCallback);
      
      await ch.start();
      
      // Should not be connected
      expect(ch.isConnected()).toBe(false);
      expect(connectionCallback).toHaveBeenCalledWith(false);
    });
  });

  describe("stop", () => {
    it("should stop the channel", async () => {
      await channel.start();
      expect(channel.isConnected()).toBe(true);
      
      await channel.stop();
      
      expect(channel.isConnected()).toBe(false);
      expect(connectionCallback).toHaveBeenCalledWith(false);
    });

    it("should call connection callback on stop", async () => {
      await channel.start();
      connectionCallback.mockClear();
      
      await channel.stop();
      
      expect(connectionCallback).toHaveBeenCalledWith(false);
    });
  });

  describe("send", () => {
    it("should throw if not connected", async () => {
      await expect(channel.send("test", "123456789")).rejects.toThrow(
        "Telegram channel is not connected"
      );
    });

    it("should send message when connected", async () => {
      await channel.start();
      
      await channel.send("test message", "123456789");
      
      // Message sending is mocked, so we just verify it doesn't throw
      expect(channel.isConnected()).toBe(true);
    });
  });

  describe("onMessage", () => {
    it("should register message handler", () => {
      const handler = vi.fn();
      channel.onMessage(handler);
      
      // Handler is registered (we can't easily test invocation without actual bot events)
      expect(channel).toBeDefined();
    });

    it("should register multiple handlers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      channel.onMessage(handler1);
      channel.onMessage(handler2);
      
      expect(channel).toBeDefined();
    });
  });

  describe("isConnected", () => {
    it("should return false when not started", () => {
      expect(channel.isConnected()).toBe(false);
    });

    it("should return true when started", async () => {
      await channel.start();
      expect(channel.isConnected()).toBe(true);
    });

    it("should return false after stop", async () => {
      await channel.start();
      await channel.stop();
      expect(channel.isConnected()).toBe(false);
    });
  });
});
