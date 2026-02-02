/**
 * Memory flush runner - executes a special agent run to save memories
 */

import { randomUUID } from "node:crypto";
import type { AgentRuntime } from "@server/world/runtime/agents/types.js";
import type { ConversationManager } from "../../conversations/manager.js";
import { deriveConversationKey } from "../../conversations/manager.js";
import { loadConversationStore, saveConversationStore } from "../../conversations/store.js";
import type { ConversationEntry } from "../../conversations/types.js";
import {
  resolveMemoryFlushSettings,
  resolveMemoryFlushContextWindowTokens,
  shouldRunMemoryFlush,
} from "./flush.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";

export async function runMemoryFlushIfNeeded(params: {
  config: ZuckermanConfig;
  runtime: AgentRuntime;
  conversationManager: ConversationManager;
  conversationId: string;
  modelId?: string;
  agentId: string;
  landDir: string;
}): Promise<ConversationEntry | undefined> {
  const { config, runtime, conversationManager, conversationId, modelId, agentId, landDir } = params;

  // Resolve memory flush settings
  const memoryFlushSettings = resolveMemoryFlushSettings({
    memoryFlush: config.agent?.memoryFlush,
  });

  if (!memoryFlushSettings) {
    return undefined; // Memory flush disabled
  }

  // Get conversation entry to check token counts
  const conversation = conversationManager.getConversation(conversationId);
  if (!conversation) {
    return undefined;
  }

  const conversationKey = deriveConversationKey(agentId, conversation.conversation.type, conversation.conversation.label);
  const storePath = conversationManager.getStorePath();
  const store = loadConversationStore(storePath);
  const entry = store[conversationKey];

  // Check if memory flush should run
  const contextWindowTokens = resolveMemoryFlushContextWindowTokens({
    modelId,
    agentCfgContextTokens: config.agent?.contextTokens,
  });

  const shouldFlush = shouldRunMemoryFlush({
    entry,
    contextWindowTokens,
    reserveTokensFloor: memoryFlushSettings.reserveTokensFloor,
    softThresholdTokens: memoryFlushSettings.softThresholdTokens,
  });

  if (!shouldFlush) {
    return entry;
  }

  // Run memory flush
  try {
    // Run agent with memory flush prompt
    // Note: SecurityContext will be created by the runtime based on conversation
    // We pass undefined to use default security context
    const result = await runtime.run({
      conversationId,
      message: memoryFlushSettings.prompt,
      thinkingLevel: "off", // Keep flush simple
      temperature: 0.7, // Lower temperature for more focused memory saving
      // modelId is string, but model expects LLMModel - pass undefined to use default
      model: undefined,
    });

    // Update conversation entry with flush metadata
    const updatedEntry = await conversationManager.updateConversationEntry(conversationId, (current) => ({
      memoryFlushCount: (current.memoryFlushCount ?? 0) + 1,
      memoryFlushAt: Date.now(),
    }));

    return updatedEntry || entry;
  } catch (err) {
    console.warn(`[MemoryFlush] Memory flush run failed:`, err);
    return entry;
  }
}
