/**
 * Type definitions for node:sqlite (Node.js 22+ built-in module)
 * This is a placeholder until official types are available
 */

declare module "node:sqlite" {
  export interface DatabaseSync {
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export interface StatementSync {
    all<T = unknown>(...params: unknown[]): T[];
    get<T = unknown>(...params: unknown[]): T | undefined;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string, options?: { allowExtension?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
