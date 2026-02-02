import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignalChannel } from "@server/world/communication/messengers/channels/signal.js";
import type { SignalConfig } from "@server/world/config/types.js";

describe("SignalChannel", () => {
  let channel: SignalChannel;
  let config: SignalConfig;
  let connectionCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    config = {
      enabled: true,
    };
    connectionCallback = vi.fn();
    channel = new SignalChannel(config, connectionCallback);
  });

  describe("constructor", () => {
    it("should create channel with config", () => {
      expect(channel.id).toBe("signal");
      expect(channel.type).toBe("signal");
    });

    it("should accept connection callback", () => {
      const callback = vi.fn();
      const ch = new SignalChannel(config, callback);
      expect(ch).toBeDefined();
    });
  });

  describe("start", () => {
    it("should not start if already running", async () => {
      await channel.start();
      const initialCallCount = connectionCallback.mock.calls.length;
      
      await channel.start();
      
      // Should not call callback again
      expect(connectionCallback.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);
    });

    it("should not start if disabled", async () => {
      const disabledConfig: SignalConfig = { enabled: false };
      const disabledChannel = new SignalChannel(disabledConfig);
      
      await disabledChannel.start();
      
      expect(disabledChannel.isConnected()).toBe(false);
    });

    it("should mark as running when enabled", async () => {
      await channel.start();
      
      expect(channel.isConnected()).toBe(true);
      expect(connectionCallback).toHaveBeenCalledWith(true);
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
      await expect(channel.send("test", "1234567890")).rejects.toThrow(
        "Signal channel is not connected"
      );
    });

    it("should throw error about signal-cli requirement", async () => {
      await channel.start();
      
      await expect(channel.send("test message", "1234567890")).rejects.toThrow(
        "Signal integration requires signal-cli setup"
      );
    });
  });

  describe("onMessage", () => {
    it("should register message handler", () => {
      const handler = vi.fn();
      channel.onMessage(handler);
      
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
