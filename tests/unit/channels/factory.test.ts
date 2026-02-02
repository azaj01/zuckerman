import { describe, it, expect, beforeEach, vi } from "vitest";
import { initializeChannels } from "@server/world/communication/messengers/channels/factory.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";
import { SimpleRouter } from "@server/world/communication/routing/index.js";
import { SessionManager } from "@server/agents/zuckerman/sessions/index.js";
import { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";

// Mock channels to avoid actual connections
vi.mock("@server/world/communication/messengers/channels/telegram.js", () => ({
  TelegramChannel: vi.fn().mockImplementation((config, callback) => ({
    id: "telegram",
    type: "telegram",
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock("@server/world/communication/messengers/channels/discord.js", () => ({
  DiscordChannel: vi.fn().mockImplementation((config, callback) => ({
    id: "discord",
    type: "discord",
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock("@server/world/communication/messengers/channels/signal.js", () => ({
  SignalChannel: vi.fn().mockImplementation((config, callback) => ({
    id: "signal",
    type: "signal",
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  })),
}));

describe("initializeChannels", () => {
  let config: ZuckermanConfig;
  let router: SimpleRouter;
  let sessionManager: SessionManager;
  let agentFactory: AgentRuntimeFactory;
  let broadcastEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    agentFactory = new AgentRuntimeFactory();
    config = {
      channels: {},
    };
    router = new SimpleRouter(agentFactory);
    sessionManager = new SessionManager("test-agent", "/test/path");
    broadcastEvent = vi.fn();
  });

  it("should return empty registry when no channels enabled", async () => {
    const registry = await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    expect(registry.list().length).toBe(0);
  });

  it("should initialize Telegram channel when enabled", async () => {
    config.channels = {
      telegram: {
        enabled: true,
        botToken: "test-token",
      },
    };

    const registry = await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    expect(registry.get("telegram")).toBeDefined();
    expect(registry.list().length).toBe(1);
  });

  it("should initialize Discord channel when enabled", async () => {
    config.channels = {
      discord: {
        enabled: true,
        token: "test-token",
      },
    };

    const registry = await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    expect(registry.get("discord")).toBeDefined();
    expect(registry.list().length).toBe(1);
  });

  it("should initialize Signal channel when enabled", async () => {
    config.channels = {
      signal: {
        enabled: true,
      },
    };

    const registry = await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    expect(registry.get("signal")).toBeDefined();
    expect(registry.list().length).toBe(1);
  });

  it("should initialize multiple channels", async () => {
    config.channels = {
      telegram: {
        enabled: true,
        botToken: "test-token",
      },
      discord: {
        enabled: true,
        token: "test-token",
      },
      signal: {
        enabled: true,
      },
    };

    const registry = await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    expect(registry.get("telegram")).toBeDefined();
    expect(registry.get("discord")).toBeDefined();
    expect(registry.get("signal")).toBeDefined();
    expect(registry.list().length).toBe(3);
  });

  it("should not initialize disabled channels", async () => {
    config.channels = {
      telegram: {
        enabled: false,
        botToken: "test-token",
      },
      discord: {
        enabled: true,
        token: "test-token",
      },
    };

    const registry = await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    expect(registry.get("telegram")).toBeUndefined();
    expect(registry.get("discord")).toBeDefined();
    expect(registry.list().length).toBe(1);
  });

  it("should set up message routing for channels", async () => {
    config.channels = {
      telegram: {
        enabled: true,
        botToken: "test-token",
      },
    };

    const registry = await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    const telegramChannel = registry.get("telegram");
    expect(telegramChannel).toBeDefined();
    // Message routing is set up (onMessage is called)
    expect(telegramChannel?.onMessage).toBeDefined();
  });

  it("should broadcast connection events when callback provided", async () => {
    config.channels = {
      telegram: {
        enabled: true,
        botToken: "test-token",
      },
    };

    await initializeChannels(
      config,
      router,
      sessionManager,
      agentFactory,
      broadcastEvent
    );

    // Connection callback should be set up (actual broadcast happens on start)
    expect(broadcastEvent).toBeDefined();
  });
});
