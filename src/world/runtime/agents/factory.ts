import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AgentRuntime } from "./types.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { loadConfig } from "@world/config/index.js";

/**
 * Find project root by locating package.json (the definitive marker)
 * Verifies it's the correct project by checking package name
 */
export function findProjectRoot(): string | null {
  // Strategy 1: Navigate up from current file to find package.json
  const currentFile = fileURLToPath(import.meta.url);
  let searchDir = dirname(currentFile);
  const maxDepth = 20;
  
  for (let i = 0; i < maxDepth; i++) {
    const packageJsonPath = join(searchDir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.name === "zuckerman") {
          return searchDir;
        }
      } catch {
        // If we can't read/parse, assume it's correct
        return searchDir;
      }
    }
    
    const parentDir = dirname(searchDir);
    if (parentDir === searchDir) break;
    searchDir = parentDir;
  }
  
  // Strategy 2: Check environment variable
  if (process.env.PROJECT_ROOT) {
    const root = process.env.PROJECT_ROOT;
    if (existsSync(join(root, "package.json"))) {
      return root;
    }
  }
  
  // Strategy 3: Navigate up from process.cwd()
  let cwdDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const packageJsonPath = join(cwdDir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.name === "zuckerman") {
          return cwdDir;
        }
      } catch {
        return cwdDir;
      }
    }
    const parentDir = dirname(cwdDir);
    if (parentDir === cwdDir) break;
    cwdDir = parentDir;
  }
  
  return null;
}

/**
 * Fallback detection function (used when no explicit path is provided)
 * This is kept for backward compatibility
 */
function detectBaseDirFallback(): { baseDir: string; isProduction: boolean; agentsDir: string } {
  const projectRoot = findProjectRoot();
  
  if (projectRoot) {
    const distAgentsDir = join(projectRoot, "dist", "agents");
    const srcAgentsDir = join(projectRoot, "src", "agents");
    
    if (existsSync(distAgentsDir)) {
      return { baseDir: "dist", isProduction: true, agentsDir: distAgentsDir };
    }
    if (existsSync(srcAgentsDir)) {
      return { baseDir: "src", isProduction: false, agentsDir: srcAgentsDir };
    }
  }
  
  // Last resort: use process.cwd()
  const fallbackSrc = join(process.cwd(), "src", "agents");
  return { baseDir: "src", isProduction: false, agentsDir: fallbackSrc };
}

/**
 * Options for AgentRuntimeFactory constructor
 */
export interface AgentRuntimeFactoryOptions {
  /** Project root directory (will check for src/agents or dist/agents relative to this) */
  projectRoot?: string;
  /** Direct path to agents directory (takes precedence over projectRoot) */
  agentsDir?: string;
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
 * Discovers agents dynamically from src/agents/ or dist/agents/ directory
 */
export class AgentRuntimeFactory {
  private readonly agentsDir: string;
  private readonly isProduction: boolean;
  private runtimes = new Map<string, AgentRuntime>();
  private sessionManagers = new Map<string, SessionManager>();
  private discoveredAgents: string[] | null = null;
  private loadErrors = new Map<string, string>();

  constructor(options?: AgentRuntimeFactoryOptions) {
    // Determine agents directory and production mode
    if (options?.agentsDir) {
      // Direct agents directory path provided
      this.agentsDir = options.agentsDir;
      this.isProduction = this.agentsDir.includes("/dist/");
    } else if (options?.projectRoot) {
      // Project root provided - check for agents directory
      const distAgentsDir = join(options.projectRoot, "dist", "agents");
      const srcAgentsDir = join(options.projectRoot, "src", "agents");
      
      if (existsSync(distAgentsDir)) {
        this.agentsDir = distAgentsDir;
        this.isProduction = true;
      } else if (existsSync(srcAgentsDir)) {
        this.agentsDir = srcAgentsDir;
        this.isProduction = false;
      } else {
        // Fallback to src/agents even if it doesn't exist yet
        this.agentsDir = srcAgentsDir;
        this.isProduction = false;
      }
    } else {
      // No options provided - use fallback detection
      const detected = detectBaseDirFallback();
      this.agentsDir = detected.agentsDir;
      this.isProduction = detected.isProduction;
    }
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

    try {
      if (!existsSync(this.agentsDir)) {
        this.discoveredAgents = [];
        return [];
      }

      const entries = await readdir(this.agentsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const agentId = entry.name;
        // Check for runtime.js in dist, runtime.ts in src
        const runtimePath = join(this.agentsDir, agentId, this.isProduction ? "runtime.js" : "runtime.ts");
        
        if (existsSync(runtimePath)) {
          agents.push(agentId);
        }
      }
    } catch (err) {
      console.warn(`[AgentFactory] Failed to discover agents:`, err);
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
      // In production, use .js; in dev mode (tsx), use .ts
      const runtimeExtension = this.isProduction ? "js" : "ts";
      const runtimePath = join(this.agentsDir, agentId, `runtime.${runtimeExtension}`);
      
      if (!existsSync(runtimePath)) {
        throw new Error(`Runtime file not found: ${runtimePath} (production mode: ${this.isProduction}, agentsDir: ${this.agentsDir})`);
      }

      // Dynamic import - world doesn't know about specific agents
      // Convention: each agent exports a runtime class from runtime.ts
      let module: any;
      
      if (this.isProduction) {
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
      const runtimeExtension = this.isProduction ? "js" : "ts";
      const runtimePath = join(this.agentsDir, agentId, `runtime.${runtimeExtension}`);
      
      const fullError = `Error: ${errorDetails}\nRuntime path: ${runtimePath}\nPath exists: ${existsSync(runtimePath)}\nProduction mode: ${this.isProduction}${stack ? `\nStack:\n${stack}` : ""}`;
      
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
