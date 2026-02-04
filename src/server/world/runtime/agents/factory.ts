import type { AgentRuntime } from "./types.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { loadConfig } from "@server/world/config/index.js";
import { getAgentRuntimeClass, getRegisteredAgentIds } from "@server/agents/index.js";

/**
 * Options for AgentRuntimeFactory constructor
 */
export interface AgentRuntimeFactoryOptions {
  // No options needed - agents are imported via registry
}

/**
 * Check if a class is a valid AgentRuntime implementation
 */
function isValidRuntimeClass(cls: unknown): cls is new (conversationManager?: ConversationManager) => AgentRuntime {
  if (typeof cls !== "function") {
    return false;
  }

  const prototype = cls.prototype;
  if (!prototype) {
    return false;
  }

  // Must have run method (agentId is a class property, not prototype property)
  return typeof prototype.run === "function";
}

/**
 * Agent runtime factory - creates and manages agent runtime instances
 * Uses agent registry for discovery (no file system detection)
 */
export class AgentRuntimeFactory {
  private runtimes = new Map<string, AgentRuntime>();
  private conversationManagers = new Map<string, ConversationManager>();
  private loadErrors = new Map<string, string>();

  constructor(_options?: AgentRuntimeFactoryOptions) {
    // No initialization needed - agents are imported via registry
  }

  /**
   * Get or create conversation manager for an agent
   */
  getConversationManager(agentId: string): ConversationManager {
    let manager = this.conversationManagers.get(agentId);
    if (!manager) {
      manager = new ConversationManager(agentId);
      this.conversationManagers.set(agentId, manager);
    }
    return manager;
  }


  /**
   * Get or create an agent runtime
   */
  async getRuntime(agentId: string, clearCacheOnError = true): Promise<AgentRuntime | null> {
    // Check cache
    const cached = this.runtimes.get(agentId);
    if (cached) {
      return cached;
    }

    // Clear any previous error for this agent
    this.loadErrors.delete(agentId);

    // Load runtime from registry
    try {
      const runtime = await this.createRuntime(agentId);
      if (runtime) {
        this.runtimes.set(agentId, runtime);
        return runtime;
      }
      
      // If runtime is null, check if there's a stored error from a previous attempt
      const storedError = this.loadErrors.get(agentId);
      if (storedError) {
        throw new Error(storedError);
      }
      
      return null;
    } catch (err) {
      // Error is already logged and stored in createRuntime
      // If we have a cached entry, try clearing and retrying
      if (clearCacheOnError && this.runtimes.has(agentId)) {
        console.warn(`[AgentFactory] Runtime for "${agentId}" failed to load, clearing cache and retrying...`);
        this.clearCache(agentId);
        try {
          const retryRuntime = await this.createRuntime(agentId);
          if (retryRuntime) {
            this.runtimes.set(agentId, retryRuntime);
            return retryRuntime;
          }
        } catch (retryErr) {
          // Retry also failed, use the retry error if it's more specific
          const retryError = retryErr instanceof Error ? retryErr.message : String(retryErr);
          this.loadErrors.set(agentId, retryError);
          throw retryErr;
        }
      }
      // Re-throw so caller can catch it
      throw err;
    }
  }

  /**
   * Create a new runtime instance for an agent from registry
   */
  private async createRuntime(agentId: string): Promise<AgentRuntime | null> {
    try {
      // Get runtime class from registry
      const RuntimeClass = getAgentRuntimeClass(agentId);

      if (!RuntimeClass) {
        const registeredAgents = getRegisteredAgentIds().join(", ");
        const errorMsg = `Agent "${agentId}" is not registered. Registered agents: ${registeredAgents || "none"}`;
        console.error(`[AgentFactory] ${errorMsg}`);
        this.loadErrors.set(agentId, errorMsg);
        return null;
      }

      if (!isValidRuntimeClass(RuntimeClass)) {
        const errorMsg = `Agent "${agentId}" runtime class does not implement AgentRuntime interface`;
        console.error(`[AgentFactory] ${errorMsg}`);
        this.loadErrors.set(agentId, errorMsg);
        return null;
      }

      const conversationManager = this.getConversationManager(agentId);
      const runtime = new RuntimeClass(conversationManager);
      
      // Initialize the runtime if it has an initialize method
      if (runtime.initialize) {
        await runtime.initialize();
      }
      
      return runtime;
    } catch (err) {
      const errorDetails = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      
      const fullError = `Error: ${errorDetails}${stack ? `\nStack:\n${stack}` : ""}`;
      
      console.error(`[AgentFactory] Failed to load runtime for agent "${agentId}":`);
      console.error(`[AgentFactory]   ${fullError}`);
      
      // Store error for retrieval
      this.loadErrors.set(agentId, errorDetails);
      
      // Re-throw the error so it can be caught and reported to the client
      throw new Error(fullError);
    }
  }

  /**
   * Clear runtime cache (for hot reload)
   */
  clearCache(agentId?: string): void {
    if (agentId) {
      const runtime = this.runtimes.get(agentId);
      if (runtime?.clearCache) {
        runtime.clearCache();
      }
      this.runtimes.delete(agentId);
      this.loadErrors.delete(agentId);
    } else {
      for (const runtime of this.runtimes.values()) {
        if (runtime.clearCache) {
          runtime.clearCache();
        }
      }
      this.runtimes.clear();
      this.loadErrors.clear();
    }
  }

  /**
   * Get the last load error for an agent (if any)
   */
  getLoadError(agentId: string): string | undefined {
    return this.loadErrors.get(agentId);
  }

  /**
   * List available agent IDs
   * First checks config.json, then falls back to registry
   */
  async listAgents(): Promise<string[]> {
    // First, try to get agents from config.json
    try {
      const config = await loadConfig();
      if (config.agents?.list && config.agents.list.length > 0) {
        const configAgents = config.agents.list.map(a => a.id);
        // Verify these agents are registered
        const registeredAgents = getRegisteredAgentIds();
        const validAgents = configAgents.filter(id => registeredAgents.includes(id));
        if (validAgents.length > 0) {
          return validAgents;
        }
      }
    } catch (err) {
      console.warn("Failed to load agents from config:", err);
    }

    // Fallback to registry
    return getRegisteredAgentIds();
  }
}
