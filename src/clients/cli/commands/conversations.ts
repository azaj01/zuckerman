import { Command } from "commander";
import { GatewayClient } from "../gateway-client.js";
import { ensureGatewayRunning } from "../gateway-utils.js";
import { outputJson, shouldOutputJson, parseJsonInput } from "../utils/json-output.js";

export function createConversationsCommand(): Command {
  const cmd = new Command("conversations")
    .description("Manage conversations");

  cmd
    .command("list")
    .description("List all conversations")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (options: { host?: string; port?: string; json?: boolean }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({ method: "conversations.list" });

        if (!response.ok || !response.result) {
          console.error("Failed to list conversations:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          conversations: Array<{
            id: string;
            label: string;
            type: string;
            agentId?: string;
            createdAt: number;
            lastActivity: number;
          }>;
        };
        const conversations = result.conversations || [];

        if (shouldOutputJson(options)) {
          outputJson({ conversations }, options);
        } else {
          if (conversations.length === 0) {
            console.log("No conversations found.");
          } else {
            console.log("Conversations:");
            conversations.forEach((conversation) => {
              const created = new Date(conversation.createdAt).toLocaleString();
              const lastActivity = new Date(conversation.lastActivity).toLocaleString();
              console.log(`  ${conversation.id.slice(0, 8)}...`);
              console.log(`    Label: ${conversation.label}`);
              console.log(`    Type: ${conversation.type}`);
              if (conversation.agentId) {
                console.log(`    Agent: ${conversation.agentId}`);
              }
              console.log(`    Created: ${created}`);
              console.log(`    Last Activity: ${lastActivity}`);
              console.log();
            });
          }
        }

        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  cmd
    .command("get")
    .description("Get conversation details")
    .argument("<conversation-id>", "Conversation ID")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (conversationId: string, options: { host?: string; port?: string; json?: boolean }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({
          method: "conversations.get",
          params: { id: conversationId },
        });

        if (!response.ok || !response.result) {
          console.error("Failed to get conversation:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          conversation: {
            conversation: {
              id: string;
              label: string;
              type: string;
              agentId?: string;
              createdAt: number;
              lastActivity: number;
            };
            messages: Array<{
              role: string;
              content: string;
              timestamp: number;
            }>;
          };
        };

        const { conversation, messages } = result.conversation;

        if (shouldOutputJson(options)) {
          outputJson({ conversation, messages }, options);
        } else {
          console.log(`Conversation: ${conversation.id}`);
          console.log(`Label: ${conversation.label}`);
          console.log(`Type: ${conversation.type}`);
          if (conversation.agentId) {
            console.log(`Agent: ${conversation.agentId}`);
          }
          console.log(`Created: ${new Date(conversation.createdAt).toLocaleString()}`);
          console.log(`Last Activity: ${new Date(conversation.lastActivity).toLocaleString()}`);
          console.log(`Messages: ${messages.length}`);
          console.log();

          if (messages.length > 0) {
            console.log("Message History:");
            messages.forEach((msg, idx) => {
              const time = new Date(msg.timestamp).toLocaleTimeString();
              console.log(`\n[${idx + 1}] ${msg.role.toUpperCase()} (${time})`);
              console.log(msg.content);
            });
          }
        }

        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  cmd
    .command("create")
    .description("Create a new conversation")
    .option("--type <type>", "Conversation type (main, group, channel)", "main")
    .option("--agent-id <agent-id>", "Agent ID")
    .option("--label <label>", "Conversation label")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .option("--input <json>", "JSON input for conversation data (or pipe JSON)")
    .action(async (options: {
      type?: string;
      agentId?: string;
      label?: string;
      host?: string;
      port?: string;
      json?: boolean;
      input?: string;
    }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();

        // Parse JSON input if provided (only if --input is used)
        let conversationData: { type?: string; agentId?: string; label?: string } = {};
        if (options.input) {
          const input = await parseJsonInput(options.input);
          conversationData = input as typeof conversationData;
        }

        const params = {
          type: conversationData.type || options.type || "main",
          agentId: conversationData.agentId || options.agentId,
          label: conversationData.label || options.label || `conversation-${Date.now()}`,
        };

        const response = await client.call({
          method: "conversations.create",
          params,
        });

        if (!response.ok || !response.result) {
          console.error("Failed to create conversation:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as { conversation: { id: string; label: string; type: string; agentId?: string } };

        if (shouldOutputJson(options)) {
          outputJson(result, options);
        } else {
          console.log(`Conversation created: ${result.conversation.id}`);
          console.log(`Label: ${result.conversation.label}`);
          console.log(`Type: ${result.conversation.type}`);
          if (result.conversation.agentId) {
            console.log(`Agent: ${result.conversation.agentId}`);
          }
        }

        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  cmd
    .command("delete")
    .description("Delete a conversation")
    .argument("<conversation-id>", "Conversation ID")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (conversationId: string, options: { host?: string; port?: string; json?: boolean }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({
          method: "conversations.delete",
          params: { id: conversationId },
        });

        if (!response.ok) {
          console.error("Failed to delete conversation:", response.error?.message);
          process.exit(1);
        }

        if (shouldOutputJson(options)) {
          outputJson({ deleted: true, conversationId }, options);
        } else {
          console.log(`Conversation ${conversationId} deleted.`);
        }
        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  cmd
    .command("send")
    .description("Send a message to a conversation")
    .argument("<conversation-id>", "Conversation ID")
    .option("-m, --message <message>", "Message to send")
    .option("-a, --agent <agent-id>", "Agent ID (required if conversation doesn't have one)")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .option("--input <json>", "JSON input for message data (or pipe JSON)")
    .action(async (
      conversationId: string,
      options: {
        message?: string;
        agent?: string;
        host?: string;
        port?: string;
        json?: boolean;
        input?: string;
      },
    ) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();

        // Parse JSON input if provided (only if --input is used)
        let messageData: { message?: string; agentId?: string } = {};
        if (options.input) {
          const input = await parseJsonInput(options.input);
          messageData = input as typeof messageData;
        }

        const message = messageData.message || options.message;
        if (!message) {
          console.error("Error: Message is required. Use --message <text> or --input <json>");
          process.exit(1);
        }

        // Get conversation to find agentId if not provided
        let agentId = messageData.agentId || options.agent;
        if (!agentId) {
          const conversationResponse = await client.call({
            method: "conversations.get",
            params: { id: conversationId },
          });
          if (conversationResponse.ok && conversationResponse.result) {
            const conversationResult = conversationResponse.result as {
              conversation: { conversation?: { agentId?: string } };
            };
            agentId = conversationResult.conversation?.conversation?.agentId;
          }
        }

        if (!agentId) {
          console.error("Error: Agent ID is required. Use --agent <agent-id> or ensure conversation has an agentId");
          process.exit(1);
        }

        const response = await client.call({
          method: "agent.run",
          params: {
            conversationId,
            agentId,
            message,
          },
          // No timeout - let requests complete naturally
        });

        if (!response.ok) {
          console.error("Failed to send message:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          response: string;
          runId: string;
          tokensUsed?: number;
          toolsUsed?: string[];
        };

        if (shouldOutputJson(options)) {
          outputJson(result, options);
        } else {
          console.log(result.response);
          if (result.tokensUsed) {
            process.stderr.write(`\n[Tokens: ${result.tokensUsed}]\n`);
          }
        }

        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  cmd
    .command("messages")
    .description("List messages in a conversation")
    .argument("<conversation-id>", "Conversation ID")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .option("--limit <number>", "Limit number of messages to show", "100")
    .action(async (
      conversationId: string,
      options: {
        host?: string;
        port?: string;
        json?: boolean;
        limit?: string;
      },
    ) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;
      const limit = options.limit ? parseInt(options.limit, 10) : 100;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({
          method: "conversations.get",
          params: { id: conversationId },
        });

        if (!response.ok || !response.result) {
          console.error("Failed to get conversation:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          conversation: {
            conversation?: {
              id: string;
              label?: string;
              type?: string;
              agentId?: string;
              createdAt?: number;
              lastActivity?: number;
            };
            messages?: Array<{
              role: string;
              content: string;
              timestamp?: number;
              toolCallId?: string;
              toolCalls?: unknown[];
            }>;
          };
        };

        const { conversation: conversationInfo, messages } = result.conversation;
        const messageList = (messages || []).slice(-limit);

        if (shouldOutputJson(options)) {
          outputJson({ conversation: conversationInfo, messages: messageList }, options);
        } else {
          if (conversationInfo) {
            console.log(`Conversation: ${conversationInfo.id}`);
            if (conversationInfo.label) console.log(`Label: ${conversationInfo.label}`);
            if (conversationInfo.type) console.log(`Type: ${conversationInfo.type}`);
            if (conversationInfo.agentId) console.log(`Agent: ${conversationInfo.agentId}`);
            if (conversationInfo.createdAt) {
              console.log(`Created: ${new Date(conversationInfo.createdAt).toLocaleString()}`);
            }
            if (conversationInfo.lastActivity) {
              console.log(`Last Activity: ${new Date(conversationInfo.lastActivity).toLocaleString()}`);
            }
            console.log(`Messages: ${messageList.length}${messages && messages.length > limit ? ` (showing last ${limit} of ${messages.length})` : ""}`);
            console.log();
          }

          if (messageList.length > 0) {
            console.log("Message History:");
            messageList.forEach((msg, idx) => {
              const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : "unknown";
              console.log(`\n[${idx + 1}] ${msg.role.toUpperCase()} (${time})`);
              console.log(msg.content);
            });
          } else {
            console.log("No messages in this conversation.");
          }
        }

        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  return cmd;
}
