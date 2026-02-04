/**
 * Database initialization for memory vector storage
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ResolvedMemorySearchConfig } from "../../config.js";
import { ensureMemoryIndexSchema } from "../encoding/schema.js";

export type InitializeDatabaseResult = {
  db: DatabaseSync;
  ftsAvailable: boolean;
  ftsError?: string;
};

type DatabaseRegistryEntry = {
  db: DatabaseSync;
  ftsAvailable: boolean;
  ftsError?: string;
};

/**
 * Shared registry for database instances per agent/workspace combination
 * Key format: `${agentId}:${workspaceDir}`
 */
const DATABASE_REGISTRY = new Map<string, DatabaseRegistryEntry>();

/**
 * Get database from registry for a given agent/workspace combination.
 * Returns null if not found in registry.
 */
export function getDatabase(
  workspaceDir: string,
  agentId: string,
): InitializeDatabaseResult | null {
  const registryKey = `${agentId}:${workspaceDir}`;
  const existing = DATABASE_REGISTRY.get(registryKey);
  
  if (!existing) {
    return null;
  }

  return {
    db: existing.db,
    ftsAvailable: existing.ftsAvailable,
    ...(existing.ftsError ? { ftsError: existing.ftsError } : {}),
  };
}

/**
 * Initialize the database connection and schema.
 * Creates the database file if it doesn't exist and sets up all required tables.
 * Registers the database in the shared registry for reuse.
 */
export function initializeDatabase(
  config: ResolvedMemorySearchConfig,
  workspaceDir: string,
  agentId: string,
  embeddingCacheTable: string,
  ftsTable: string,
): InitializeDatabaseResult {
  const dbPath = config.store.path;
  const dbDir = dirname(dbPath);
  
  try {
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    const db = new DatabaseSync(dbPath);
    
    // Enable FTS5 if available
    const ftsEnabled = config.store.vector.enabled;
    const { ftsAvailable, ftsError } = ensureMemoryIndexSchema({
      db,
      embeddingCacheTable,
      ftsTable,
      ftsEnabled,
    });

    if (!ftsAvailable && ftsEnabled) {
      console.warn(`FTS5 not available: ${ftsError || "unknown error"}, falling back to vector-only search`);
    }

    // Verify database is working by running a simple query
    db.prepare("SELECT 1").get();
    
    console.log(`[Memory] Database initialized at ${dbPath}${ftsEnabled && ftsAvailable ? " (FTS5 enabled)" : ""}`);
    
    const result = { db, ftsAvailable, ...(ftsError ? { ftsError } : {}) };
    
    // Register the database for reuse
    const registryKey = `${agentId}:${workspaceDir}`;
    DATABASE_REGISTRY.set(registryKey, {
      db: result.db,
      ftsAvailable: result.ftsAvailable,
      ...(result.ftsError ? { ftsError: result.ftsError } : {}),
    });
    
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Memory] Failed to initialize database at ${dbPath}:`, message);
    throw new Error(`Database initialization failed: ${message}`);
  }
}
