/**
 * Memory flush mechanism - prompts agent to save memories before context window fills
 * Based on OpenClaw's memory flush implementation
 */

import type { ConversationEntry } from "../../conversations/types.js";

export const DEFAULT_MEMORY_FLUSH_SOFT_TOKENS = 4000;
export const DEFAULT_CONTEXT_TOKENS = 200_000; // Default large context window
export const DEFAULT_RESERVE_TOKENS_FLOOR = 10_000;

export const DEFAULT_MEMORY_FLUSH_PROMPT = [
  "Pre-compaction memory flush.",
  "Store durable memories now (use memory/YYYY-MM-DD.md; create memory/ if needed).",
  "If nothing to store, reply with OK.",
].join(" ");

export const DEFAULT_MEMORY_FLUSH_SYSTEM_PROMPT = [
  "Pre-compaction memory flush turn.",
  "The conversation is near auto-compaction; capture durable memories to disk.",
  "You may reply, but usually just saving memories is correct.",
].join(" ");

export type MemoryFlushSettings = {
  enabled: boolean;
  softThresholdTokens: number;
  prompt: string;
  systemPrompt: string;
  reserveTokensFloor: number;
};

/**
 * Common model context window sizes
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic Claude
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-opus-20240229": 200_000,
  "claude-3-sonnet-20240229": 200_000,
  "claude-3-haiku-20240307": 200_000,
  "claude-sonnet-": 1_000_000, // Extended context
  
  // OpenAI
  "gpt-4o": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  
  // OpenRouter models (common ones)
  "anthropic/claude-3.5-sonnet": 200_000,
  "openai/gpt-4o": 128_000,
  "google/gemini-pro": 1_000_000,
  "meta-llama/llama-3.1-405b": 128_000,
};

/**
 * Lookup context window size for a model
 */
export function lookupContextTokens(modelId?: string, agentCfgContextTokens?: number): number {
  if (agentCfgContextTokens && agentCfgContextTokens > 0) {
    return agentCfgContextTokens;
  }
  
  if (!modelId) {
    return DEFAULT_CONTEXT_TOKENS;
  }
  
  // Check exact match first
  if (modelId in MODEL_CONTEXT_WINDOWS) {
    return MODEL_CONTEXT_WINDOWS[modelId];
  }
  
  // Check prefix matches (e.g., "claude-sonnet-4-20250514" matches "claude-sonnet-")
  for (const [prefix, tokens] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (prefix.endsWith("-") && modelId.startsWith(prefix)) {
      return tokens;
    }
  }
  
  // Default fallback
  return DEFAULT_CONTEXT_TOKENS;
}

const normalizeNonNegativeInt = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.floor(value);
  return int >= 0 ? int : null;
};

/**
 * Resolve memory flush settings from config
 */
export function resolveMemoryFlushSettings(cfg?: {
  memoryFlush?: {
    enabled?: boolean;
    softThresholdTokens?: number;
    prompt?: string;
    systemPrompt?: string;
    reserveTokensFloor?: number;
  };
}): MemoryFlushSettings | null {
  const defaults = cfg?.memoryFlush;
  const enabled = defaults?.enabled ?? true;
  if (!enabled) return null;
  
  const softThresholdTokens =
    normalizeNonNegativeInt(defaults?.softThresholdTokens) ?? DEFAULT_MEMORY_FLUSH_SOFT_TOKENS;
  const prompt = defaults?.prompt?.trim() || DEFAULT_MEMORY_FLUSH_PROMPT;
  const systemPrompt = defaults?.systemPrompt?.trim() || DEFAULT_MEMORY_FLUSH_SYSTEM_PROMPT;
  const reserveTokensFloor =
    normalizeNonNegativeInt(defaults?.reserveTokensFloor) ?? DEFAULT_RESERVE_TOKENS_FLOOR;

  return {
    enabled,
    softThresholdTokens,
    prompt,
    systemPrompt,
    reserveTokensFloor,
  };
}

/**
 * Resolve context window tokens for memory flush
 */
export function resolveMemoryFlushContextWindowTokens(params: {
  modelId?: string;
  agentCfgContextTokens?: number;
}): number {
  return lookupContextTokens(params.modelId, params.agentCfgContextTokens);
}

/**
 * Determine if memory flush should run
 */
export function shouldRunMemoryFlush(params: {
  entry?: Pick<ConversationEntry, "totalTokens" | "memoryFlushCount">;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
}): boolean {
  const totalTokens = params.entry?.totalTokens;
  if (!totalTokens || totalTokens <= 0) return false;
  
  const contextWindow = Math.max(1, Math.floor(params.contextWindowTokens));
  const reserveTokens = Math.max(0, Math.floor(params.reserveTokensFloor));
  const softThreshold = Math.max(0, Math.floor(params.softThresholdTokens));
  const threshold = Math.max(0, contextWindow - reserveTokens - softThreshold);
  
  if (threshold <= 0) return false;
  if (totalTokens < threshold) return false;

  // Don't flush if we just flushed (check memoryFlushCount)
  // This prevents multiple flushes in quick succession
  const lastFlushCount = params.entry?.memoryFlushCount ?? 0;
  // We'll track this separately - for now, allow flush if threshold is met
  
  return true;
}
