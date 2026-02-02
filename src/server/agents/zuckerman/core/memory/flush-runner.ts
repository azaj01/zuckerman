/**
 * Memory flush runner - executes a special agent run to save memories
 */

import { randomUUID } from "node:crypto";
import type { AgentRuntime } from "@server/world/runtime/agents/types.js";
import type { SessionManager } from "../../sessions/manager.js";
import { deriveSessionKey } from "../../sessions/manager.js";
import { loadSessionStore, saveSessionStore } from "../../sessions/store.js";
import type { SessionEntry } from "../../sessions/types.js";
import {
  resolveMemoryFlushSettings,
  resolveMemoryFlushContextWindowTokens,
  shouldRunMemoryFlush,
} from "./flush.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";

export async function runMemoryFlushIfNeeded(params: {
  config: ZuckermanConfig;
  runtime: AgentRuntime;
  sessionManager: SessionManager;
  sessionId: string;
  modelId?: string;
  agentId: string;
  landDir: string;
}): Promise<SessionEntry | undefined> {
  const { config, runtime, sessionManager, sessionId, modelId, agentId, landDir } = params;

  // Resolve memory flush settings
  const memoryFlushSettings = resolveMemoryFlushSettings({
    memoryFlush: config.agent?.memoryFlush,
  });

  if (!memoryFlushSettings) {
    return undefined; // Memory flush disabled
  }

  // Get session entry to check token counts
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    return undefined;
  }

  const sessionKey = deriveSessionKey(agentId, session.session.type, session.session.label);
  const storePath = sessionManager.getStorePath();
  const store = loadSessionStore(storePath);
  const entry = store[sessionKey];

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
    // Note: SecurityContext will be created by the runtime based on session
    // We pass undefined to use default security context
    const result = await runtime.run({
      sessionId,
      message: memoryFlushSettings.prompt,
      thinkingLevel: "off", // Keep flush simple
      temperature: 0.7, // Lower temperature for more focused memory saving
      // modelId is string, but model expects LLMModel - pass undefined to use default
      model: undefined,
    });

    // Update session entry with flush metadata
    const updatedEntry = await sessionManager.updateSessionEntry(sessionId, (current) => ({
      memoryFlushCount: (current.memoryFlushCount ?? 0) + 1,
      memoryFlushAt: Date.now(),
    }));

    return updatedEntry || entry;
  } catch (err) {
    console.warn(`[MemoryFlush] Memory flush run failed:`, err);
    return entry;
  }
}
