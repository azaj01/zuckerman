import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AgentRuntime } from "./types.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { loadConfig } from "@world/config/index.js";

/**
 * Detect if we're running from dist/ or src/
 * Returns the base directory (src or dist) and whether we're in production
 */
function detectBaseDir(): { baseDir: string; isProduction: boolean; agentsDir: string } {
  // Get the current file's location
  const currentFile = fileURLToPath(import.meta.url);
  const isInDist = currentFile.includes("/dist/");
  
  // Find project root by navigating up from current file
  // Current file might be at: .../dist/world/runtime/agents/factory.js
  // Or: .../src/world/runtime/agents/factory.ts
  // We need to find the directory that contains either src/agents or dist/agents
  
  let searchDir = dirname(currentFile);
  const maxDepth = 15; // Prevent infinite loops (increased for Electron app paths)
  let depth = 0;
  
  console.log(`[AgentFactory] detectBaseDir: Starting from ${currentFile}`);
  console.log(`[AgentFactory] detectBaseDir: Initial searchDir: ${searchDir}`);
  
  while (depth < maxDepth) {
    // Check for dist/agents
    const distAgentsDir = join(searchDir, "dist", "agents");
    if (existsSync(distAgentsDir)) {
      console.log(`[AgentFactory] detectBaseDir: Found dist/agents at ${distAgentsDir}`);
      return { baseDir: "dist", isProduction: true, agentsDir: distAgentsDir };
    }
    
    // Check for src/agents
    const srcAgentsDir = join(searchDir, "src", "agents");
    if (existsSync(srcAgentsDir)) {
      console.log(`[AgentFactory] detectBaseDir: Found src/agents at ${srcAgentsDir}`);
      return { baseDir: "src", isProduction: false, agentsDir: srcAgentsDir };
    }
    
    // Check if we've reached the filesystem root
    const parentDir = dirname(searchDir);
    if (parentDir === searchDir) {
      // Reached filesystem root
      console.log(`[AgentFactory] detectBaseDir: Reached filesystem root at ${searchDir}`);
      break;
    }
    
    // Continue navigating up (don't stop at first package.json, keep going to find the real project root)
    searchDir = parentDir;
    depth++;
  }
  
  // Fallback: try to find project root by looking for package.json
  console.log(`[AgentFactory] detectBaseDir: Navigation failed, trying fallback with process.cwd(): ${process.cwd()}`);
  
  // Also try going up from process.cwd() to find project root
  let cwdDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const cwdDistAgents = join(cwdDir, "dist", "agents");
    const cwdSrcAgents = join(cwdDir, "src", "agents");
    
    console.log(`[AgentFactory] detectBaseDir: Fallback check ${i}: ${cwdDir}`);
    console.log(`[AgentFactory] detectBaseDir:   dist/agents exists: ${existsSync(cwdDistAgents)}`);
    console.log(`[AgentFactory] detectBaseDir:   src/agents exists: ${existsSync(cwdSrcAgents)}`);
    
    if (existsSync(cwdDistAgents)) {
      console.log(`[AgentFactory] detectBaseDir: Found dist/agents via cwd fallback at ${cwdDistAgents}`);
      return { baseDir: "dist", isProduction: true, agentsDir: cwdDistAgents };
    }
    if (existsSync(cwdSrcAgents)) {
      console.log(`[AgentFactory] detectBaseDir: Found src/agents via cwd fallback at ${cwdSrcAgents}`);
      return { baseDir: "src", isProduction: false, agentsDir: cwdSrcAgents };
    }
    
    // Check for project root markers
    if (existsSync(join(cwdDir, "package.json")) || existsSync(join(cwdDir, ".git"))) {
      console.log(`[AgentFactory] detectBaseDir: Found project root marker at ${cwdDir}`);
      // If we found project root but no agents, that's a problem
      // But continue searching in case agents are elsewhere
    }
    
    const parentCwd = dirname(cwdDir);
    if (parentCwd === cwdDir) break;
    cwdDir = parentCwd;
  }
  
  // Last resort: use process.cwd() directly
  const fallbackSrc = join(process.cwd(), "src", "agents");
  console.log(`[AgentFactory] detectBaseDir: Using process.cwd() fallback: ${fallbackSrc}`);
  console.log(`[AgentFactory] detectBaseDir: WARNING - Could not find agents directory!`);
  return { baseDir: "src", isProduction: false, agentsDir: fallbackSrc };
}

/**
 * Check if a class is a valid AgentRuntime implementation
 */
function isValidRuntimeClass(cls: unknown): cls is new (sessionManager?: SessionManager) => AgentRuntime {
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
 * Discovers agents dynamically from src/agents/ directory
 */
export class AgentRuntimeFactory {
  private runtimes = new Map<string, AgentRuntime>();
  private sessionManagers = new Map<string, SessionManager>();
  private discoveredAgents: string[] | null = null;
  private loadErrors = new Map<string, string>();

  constructor() {
    // Session managers are created per-agent now
  }

  /**
   * Get or create session manager for an agent
   */
  getSessionManager(agentId: string): SessionManager {
    let manager = this.sessionManagers.get(agentId);
    if (!manager) {
      manager = new SessionManager(agentId);
      this.sessionManagers.set(agentId, manager);
    }
    return manager;
  }

  /**
   * Discover available agents by scanning agents/ directory
   */
  private async discoverAgents(): Promise<string[]> {
    if (this.discoveredAgents) {
      return this.discoveredAgents;
    }

    const agents: string[] = [];
    const { agentsDir, isProduction } = detectBaseDir();

    try {
      if (!existsSync(agentsDir)) {
        this.discoveredAgents = [];
        return [];
      }

      const entries = await readdir(agentsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const agentId = entry.name;
        // Check for runtime.js in dist, runtime.ts in src
        const runtimePath = join(agentsDir, agentId, isProduction ? "runtime.js" : "runtime.ts");
        
        if (existsSync(runtimePath)) {
          agents.push(agentId);
        }
      }
    } catch (err) {
      console.warn(`Failed to discover agents:`, err);
    }

    this.discoveredAgents = agents;
    return agents;
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

    // Load runtime dynamically
    try {
      const runtime = await this.createRuntime(agentId);
      if (runtime) {
        this.runtimes.set(agentId, runtime);
        return runtime;
      }
      
      // If runtime is null, it means the file doesn't exist
      // Check if there's a stored error from a previous attempt
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
   * Create a new runtime instance for an agent by dynamically importing it
   */
  private async createRuntime(agentId: string): Promise<AgentRuntime | null> {
    try {
      const { agentsDir, isProduction } = detectBaseDir();
      
      // In production, use .js; in dev mode (tsx), use .ts
      const runtimeExtension = isProduction ? "js" : "ts";
      const runtimePath = join(agentsDir, agentId, `runtime.${runtimeExtension}`);
      
      if (!existsSync(runtimePath)) {
        throw new Error(`Runtime file not found: ${runtimePath} (production mode: ${isProduction}, agentsDir: ${agentsDir})`);
      }

      // Dynamic import - world doesn't know about specific agents
      // Convention: each agent exports a runtime class from runtime.ts
      let module: any;
      
      if (isProduction) {
        // In production, use file:// URL for .js files
        const runtimeUrl = pathToFileURL(runtimePath).href;
        module = await import(runtimeUrl);
      } else {
        // In dev mode with tsx, use the @agents path alias which tsx can resolve
        // This works because tsx understands TypeScript path mappings
        try {
          // Try using path alias first (works with tsx)
          const aliasPath = `@agents/${agentId}/runtime.js`;
          module = await import(aliasPath);
        } catch (aliasError) {
          // Fallback to file:// URL if alias doesn't work
          try {
            const runtimeUrl = pathToFileURL(runtimePath).href;
            module = await import(runtimeUrl);
          } catch (fileError) {
            const aliasErr = aliasError instanceof Error ? aliasError.message : String(aliasError);
            const fileErr = fileError instanceof Error ? fileError.message : String(fileError);
            throw new Error(`Failed to import runtime: alias error: ${aliasErr}, file error: ${fileErr}`);
          }
        }
      }
      
      // Look for exported runtime class
      // Convention: {AgentId}Runtime (e.g., ZuckermanRuntime) or {AgentId}Awareness (e.g., ZuckermanAwareness) or default export
      const capitalizedName = agentId.charAt(0).toUpperCase() + agentId.slice(1);
      const RuntimeClass = module[`${capitalizedName}Runtime`] || module[`${capitalizedName}Awareness`] || module.default;

      if (!RuntimeClass || !isValidRuntimeClass(RuntimeClass)) {
        const foundExports = Object.keys(module).join(", ");
        const errorMsg = `Agent "${agentId}" runtime.${runtimeExtension} must export a class named "${capitalizedName}Runtime" or "${capitalizedName}Awareness" or default export that implements AgentRuntime. Found exports: ${foundExports || "none"}`;
        console.error(`[AgentFactory] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const sessionManager = this.getSessionManager(agentId);
      return new RuntimeClass(sessionManager);
    } catch (err) {
      const errorDetails = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const { agentsDir, isProduction } = detectBaseDir();
      const runtimeExtension = isProduction ? "js" : "ts";
      const runtimePath = join(agentsDir, agentId, `runtime.${runtimeExtension}`);
      
      const fullError = `Error: ${errorDetails}\nRuntime path: ${runtimePath}\nPath exists: ${existsSync(runtimePath)}\nProduction mode: ${isProduction}${stack ? `\nStack:\n${stack}` : ""}`;
      
      console.error(`[AgentFactory] Failed to load runtime for agent "${agentId}":`);
      console.error(`[AgentFactory]   ${fullError}`);
      
      // Store error for retrieval (store just the message, not full details)
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
      this.loadErrors.delete(agentId); // Clear error cache too
    } else {
      for (const runtime of this.runtimes.values()) {
        if (runtime.clearCache) {
          runtime.clearCache();
        }
      }
      this.runtimes.clear();
      this.loadErrors.clear(); // Clear all error caches
      this.discoveredAgents = null; // Reset discovery cache
    }
  }

  /**
   * Get the last load error for an agent (if any)
   */
  getLoadError(agentId: string): string | undefined {
    return this.loadErrors.get(agentId);
  }

  /**
   * List available agent IDs by discovering them dynamically
   * First checks config.json, then falls back to file system discovery
   */
  async listAgents(): Promise<string[]> {
    // First, try to get agents from config.json
    try {
      const config = await loadConfig();
      if (config.agents?.list && config.agents.list.length > 0) {
        const configAgents = config.agents.list.map(a => a.id);
        // Verify these agents exist in file system, but return config list as source of truth
        return configAgents;
      }
    } catch (err) {
      console.warn("Failed to load agents from config:", err);
    }

    // Fallback to file system discovery
    return this.discoverAgents();
  }
}
