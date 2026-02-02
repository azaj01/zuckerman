import type { ContextConfig, ContextMessage } from "./context-manager.js";
import { ContextManager } from "./context-manager.js";

/**
 * Helper to integrate context manager with session messages
 */
export class SessionContextManager {
  private contextManager: ContextManager;
  private landDir: string;

  constructor(landDir: string, config?: Partial<ContextConfig>) {
    this.landDir = landDir;
    this.contextManager = new ContextManager(config);
  }

  /**
   * Prepare messages for LLM context, applying smart compression
   */
  prepareMessagesForContext(
    sessionId: string,
    messages: Array<{ role: string; content: string; timestamp?: number }>,
    systemPromptTokens?: number,
  ): ContextMessage[] {
    const prepared = this.contextManager.prepareContext(messages, systemPromptTokens);
    
    // Track compression if it occurred
    const originalTokens = messages.reduce(
      (sum, msg) => sum + this.contextManager.estimateTokens(msg.content),
      0
    );
    const compressedTokens = prepared.reduce((sum, msg) => sum + msg.tokens, 0);
    
    if (compressedTokens < originalTokens) {
      const compressedCount = messages.length - prepared.length;
      this.contextManager.updateState(
        this.landDir,
        sessionId,
        originalTokens,
        compressedTokens,
        compressedCount,
      );
    }

    return prepared;
  }

  /**
   * Check if compression is needed for current messages
   */
  needsCompression(messages: Array<{ role: string; content: string }>): boolean {
    const contextMessages: ContextMessage[] = messages.map((msg) => ({
      role: msg.role as ContextMessage["role"],
      content: msg.content,
      timestamp: Date.now(),
      tokens: this.contextManager.estimateTokens(msg.content),
    }));

    return this.contextManager.needsCompression(contextMessages);
  }

  /**
   * Get current token usage estimate
   */
  estimateTokenUsage(messages: Array<{ role: string; content: string }>): number {
    return messages.reduce(
      (sum, msg) => sum + this.contextManager.estimateTokens(msg.content),
      0
    );
  }

  /**
   * Get context state for a session
   */
  getContextState(sessionId: string) {
    return this.contextManager.loadState(this.landDir, sessionId);
  }
}
