import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConversationManager } from "@agents/zuckerman/conversations/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ConversationManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zuckerman-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create a conversation", () => {
    const manager = new ConversationManager("test-agent", tempDir);
    const conversation = manager.createConversation("test-conversation", "main");

    expect(conversation).toHaveProperty("id");
    expect(conversation.label).toBe("test-conversation");
    expect(conversation.type).toBe("main");
    expect(conversation.createdAt).toBeGreaterThan(0);
    expect(conversation.lastActivity).toBeGreaterThan(0);
  });

  it("should retrieve a conversation", () => {
    const manager = new ConversationManager("test-agent", tempDir);
    const conversation = manager.createConversation("test", "main");
    const state = manager.getConversation(conversation.id);

    expect(state).toBeDefined();
    expect(state?.conversation.id).toBe(conversation.id);
    expect(state?.messages).toEqual([]);
  });

  it("should list all conversations", () => {
    const manager = new ConversationManager("test-agent", tempDir);
    manager.createConversation("conversation-1", "main");
    manager.createConversation("conversation-2", "group");

    const conversations = manager.listConversations();
    expect(conversations.length).toBe(2);
  });

  it("should add messages to a conversation", async () => {
    const manager = new ConversationManager("test-agent", tempDir);
    const conversation = manager.createConversation("test", "main");

    await manager.addMessage(conversation.id, "user", "Hello");
    await manager.addMessage(conversation.id, "assistant", "Hi there");

    const state = manager.getConversation(conversation.id);
    expect(state?.messages.length).toBe(2);
    expect(state?.messages[0].role).toBe("user");
    expect(state?.messages[0].content).toBe("Hello");
    expect(state?.messages[1].role).toBe("assistant");
    expect(state?.messages[1].content).toBe("Hi there");
  });

  it("should update activity timestamp", () => {
    const manager = new ConversationManager("test-agent", tempDir);
    const conversation = manager.createConversation("test", "main");
    const originalActivity = conversation.lastActivity;

    // Wait a bit
    const waitMs = 10;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        manager.updateActivity(conversation.id);
        const state = manager.getConversation(conversation.id);
        expect(state?.conversation.lastActivity).toBeGreaterThan(originalActivity);
        resolve();
      }, waitMs);
    });
  });

  it("should delete a conversation", () => {
    const manager = new ConversationManager("test-agent", tempDir);
    const conversation = manager.createConversation("test", "main");

    const deleted = manager.deleteConversation(conversation.id);
    expect(deleted).toBe(true);

    const state = manager.getConversation(conversation.id);
    expect(state).toBeUndefined();
  });

  it("should get or create main conversation", () => {
    const manager = new ConversationManager("test-agent", tempDir);
    
    // First call should create
    const conversation1 = manager.getOrCreateMainConversation();
    expect(conversation1.type).toBe("main");

    // Second call should return the same
    const conversation2 = manager.getOrCreateMainConversation();
    expect(conversation2.id).toBe(conversation1.id);
  });
});
