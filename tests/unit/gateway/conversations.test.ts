import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { startGatewayServer } from "@world/communication/gateway/server/index.js";

describe("Gateway Conversations", () => {
  let server: Awaited<ReturnType<typeof startGatewayServer>>;
  const port = 18791;

  beforeAll(async () => {
    server = await startGatewayServer({ port, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await server.close();
  });

  function createClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  }

  function sendRequest(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `test-${Date.now()}-${Math.random()}`;
      
      ws.once("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.id === id) {
          resolve(message);
        }
      });

      ws.send(JSON.stringify({ id, method, params }));

      setTimeout(() => {
        reject(new Error(`Timeout waiting for ${method} response`));
      }, 5000);
    });
  }

  it("should create a conversation", async () => {
    const ws = await createClient();
    const response = await sendRequest(ws, "conversations.create", {
      label: "test-conversation",
      type: "main",
    });

    expect(response.ok).toBe(true);
    expect(response.result.conversation).toHaveProperty("id");
    expect(response.result.conversation.label).toBe("test-conversation");
    expect(response.result.conversation.type).toBe("main");
    
    ws.close();
  });

  it("should list conversations", async () => {
    const ws = await createClient();
    
    // Create a conversation first
    const createResponse = await sendRequest(ws, "conversations.create", {
      label: "list-test",
      type: "main",
    });
    expect(createResponse.ok).toBe(true);

    // List conversations
    const listResponse = await sendRequest(ws, "conversations.list");
    expect(listResponse.ok).toBe(true);
    expect(Array.isArray(listResponse.result.conversations)).toBe(true);
    expect(listResponse.result.conversations.length).toBeGreaterThan(0);
    
    ws.close();
  });

  it("should get a conversation by id", async () => {
    const ws = await createClient();
    
    // Create a conversation
    const createResponse = await sendRequest(ws, "conversations.create", {
      label: "get-test",
      type: "main",
    });
    const conversationId = createResponse.result.conversation.id;

    // Get the conversation
    const getResponse = await sendRequest(ws, "conversations.get", { id: conversationId });
    expect(getResponse.ok).toBe(true);
    expect(getResponse.result.conversation.conversation.id).toBe(conversationId);
    expect(getResponse.result.conversation).toHaveProperty("messages");
    
    ws.close();
  });

  it("should delete a conversation", async () => {
    const ws = await createClient();
    
    // Create a conversation
    const createResponse = await sendRequest(ws, "conversations.create", {
      label: "delete-test",
      type: "main",
    });
    const conversationId = createResponse.result.conversation.id;

    // Delete the conversation
    const deleteResponse = await sendRequest(ws, "conversations.delete", { id: conversationId });
    expect(deleteResponse.ok).toBe(true);
    expect(deleteResponse.result.deleted).toBe(true);

    // Verify it's deleted
    const getResponse = await sendRequest(ws, "conversations.get", { id: conversationId });
    expect(getResponse.ok).toBe(false);
    expect(getResponse.error?.code).toBe("NOT_FOUND");
    
    ws.close();
  });
});
