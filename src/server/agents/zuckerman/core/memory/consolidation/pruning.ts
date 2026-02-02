/**
 * Context pruning system for managing context window
 * Based on OpenClaw's context pruning implementation
 */

export type ContextPruningMode = "off" | "cache-ttl";

export type ContextPruningConfig = {
  mode?: ContextPruningMode;
  /** TTL to consider cache expired (duration string, default unit: minutes). */
  ttl?: string;
  keepLastAssistants?: number;
  softTrimRatio?: number;
  hardClearRatio?: number;
  minPrunableToolChars?: number;
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  softTrim?: {
    maxChars?: number;
    headChars?: number;
    tailChars?: number;
  };
  hardClear?: {
    enabled?: boolean;
    placeholder?: string;
  };
};

export type EffectiveContextPruningSettings = {
  mode: Exclude<ContextPruningMode, "off">;
  ttlMs: number;
  keepLastAssistants: number;
  softTrimRatio: number;
  hardClearRatio: number;
  minPrunableToolChars: number;
  tools: {
    allow?: string[];
    deny?: string[];
  };
  softTrim: {
    maxChars: number;
    headChars: number;
    tailChars: number;
  };
  hardClear: {
    enabled: boolean;
    placeholder: string;
  };
};

export const DEFAULT_CONTEXT_PRUNING_SETTINGS: EffectiveContextPruningSettings = {
  mode: "cache-ttl",
  ttlMs: 5 * 60 * 1000,
  keepLastAssistants: 3,
  softTrimRatio: 0.3,
  hardClearRatio: 0.5,
  minPrunableToolChars: 50_000,
  tools: {},
  softTrim: {
    maxChars: 4_000,
    headChars: 1_500,
    tailChars: 1_500,
  },
  hardClear: {
    enabled: true,
    placeholder: "[Old tool result content cleared]",
  },
};

export function parseDurationMs(value: string, options?: { defaultUnit?: string }): number {
  const defaultUnit = options?.defaultUnit ?? "ms";
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const num = parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? defaultUnit).toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    millisecond: 1,
    milliseconds: 1,
    s: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  const multiplier = multipliers[unit] ?? 1;
  return Math.floor(num * multiplier);
}

export function computeEffectiveSettings(raw: unknown): EffectiveContextPruningSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as ContextPruningConfig;
  if (cfg.mode !== "cache-ttl") return null;

  const s: EffectiveContextPruningSettings = structuredClone(DEFAULT_CONTEXT_PRUNING_SETTINGS);
  s.mode = cfg.mode;

  if (typeof cfg.ttl === "string") {
    try {
      s.ttlMs = parseDurationMs(cfg.ttl, { defaultUnit: "m" });
    } catch {
      // keep default ttl
    }
  }

  if (typeof cfg.keepLastAssistants === "number" && Number.isFinite(cfg.keepLastAssistants)) {
    s.keepLastAssistants = Math.max(0, Math.floor(cfg.keepLastAssistants));
  }
  if (typeof cfg.softTrimRatio === "number" && Number.isFinite(cfg.softTrimRatio)) {
    s.softTrimRatio = Math.min(1, Math.max(0, cfg.softTrimRatio));
  }
  if (typeof cfg.hardClearRatio === "number" && Number.isFinite(cfg.hardClearRatio)) {
    s.hardClearRatio = Math.min(1, Math.max(0, cfg.hardClearRatio));
  }
  if (typeof cfg.minPrunableToolChars === "number" && Number.isFinite(cfg.minPrunableToolChars)) {
    s.minPrunableToolChars = Math.max(0, Math.floor(cfg.minPrunableToolChars));
  }
  if (cfg.tools) {
    s.tools = cfg.tools;
  }
  if (cfg.softTrim) {
    if (typeof cfg.softTrim.maxChars === "number" && Number.isFinite(cfg.softTrim.maxChars)) {
      s.softTrim.maxChars = Math.max(0, Math.floor(cfg.softTrim.maxChars));
    }
    if (typeof cfg.softTrim.headChars === "number" && Number.isFinite(cfg.softTrim.headChars)) {
      s.softTrim.headChars = Math.max(0, Math.floor(cfg.softTrim.headChars));
    }
    if (typeof cfg.softTrim.tailChars === "number" && Number.isFinite(cfg.softTrim.tailChars)) {
      s.softTrim.tailChars = Math.max(0, Math.floor(cfg.softTrim.tailChars));
    }
  }
  if (cfg.hardClear) {
    if (typeof cfg.hardClear.enabled === "boolean") {
      s.hardClear.enabled = cfg.hardClear.enabled;
    }
    if (typeof cfg.hardClear.placeholder === "string" && cfg.hardClear.placeholder.trim()) {
      s.hardClear.placeholder = cfg.hardClear.placeholder.trim();
    }
  }

  return s;
}
