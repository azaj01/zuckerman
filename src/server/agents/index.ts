/**
 * Agent Registry
 * 
 * Central registry for all agents. Import agents here to register them.
 * This replaces file system discovery with explicit imports.
 */

import { ZuckermanAwareness } from "./zuckerman/core/awareness/runtime.js";
import type { AgentRuntime } from "@server/world/runtime/agents/types.js";

/**
 * Agent registry mapping agent IDs to their runtime classes
 */
export const AGENT_REGISTRY: Record<string, new (sessionManager?: any) => AgentRuntime> = {
  zuckerman: ZuckermanAwareness,
};

/**
 * Get all registered agent IDs
 */
export function getRegisteredAgentIds(): string[] {
  return Object.keys(AGENT_REGISTRY);
}

/**
 * Get agent runtime class by ID
 */
export function getAgentRuntimeClass(agentId: string): (new (sessionManager?: any) => AgentRuntime) | undefined {
  return AGENT_REGISTRY[agentId];
}
