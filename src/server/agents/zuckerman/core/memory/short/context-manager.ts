import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveMemoryDir } from "@server/agents/zuckerman/core/memory/storage/persistence.js";

/**
 * Context compression strategies
 */
export type CompressionStrategy = 
  | "sliding-window"      // Keep recent N messages, summarize rest
  | "progressive-summary" // Progressively summarize older messages
  | "importance-based"   // Keep important messages, compress less important
  | "semantic-chunks"     // Group related messages and summarize
  | "hybrid";             // Combine multiple strategies

/**
 * Message importance score (0-1)
 */
export interface MessageImportance {
  messageIndex: number;
  score: number;
  reasons: string[];
}

/**
 * Context window configuration
 */
export interface ContextConfig {
  maxTokens: number;
  reserveTokens: number; // Reserve for system prompt, tools, etc.
  compressionStrategy: CompressionStrategy;
  keepRecentMessages: number; // Always keep last N messages uncompressed
  compressionThreshold: number; // Compress when usage exceeds this % of max
  minCompressionRatio: number; // Minimum compression ratio (0-1)
}

/**
 * Context state for a session
 */
export interface ContextState {
  sessionId: string;
  totalTokens: number;
  messageCount: number;
  compressedCount: number;
  lastCompressionAt: number;
  compressionHistory: Array<{
    timestamp: number;
    tokensBefore: number;
    tokensAfter: number;
    messagesCompressed: number;
  }>;
}

/**
 * Message metadata for context management
 */
export interface ContextMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  tokens: number;
  importance?: number;
  compressed?: boolean;
  summary?: string;
  originalLength?: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 20000,
  reserveTokens: 5000,
  compressionStrategy: "hybrid",
  keepRecentMessages: 10,
  compressionThreshold: 0.8, // Compress at 80% usage
  minCompressionRatio: 0.3, // Compress to at least 30% of original
};

/**
 * Smart context manager for session memory
 * Manages context window to prevent exceeding token limits
 */
export class ContextManager {
  private config: ContextConfig;
  private stateCache: Map<string, ContextState> = new Map();

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate token count (rough: ~4 chars per token)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate message importance score
   */
  calculateImportance(message: ContextMessage, index: number, total: number): number {
    let score = 0.5; // Base score

    // Recency boost (more recent = more important)
    const recencyRatio = 1 - (index / total);
    score += recencyRatio * 0.3;

    // Length factor (very short or very long might be less important)
    const lengthRatio = Math.min(message.tokens / 500, 1);
    score += (1 - Math.abs(lengthRatio - 0.5)) * 0.1;

    // Role importance
    if (message.role === "user") score += 0.1;
    if (message.role === "system") score += 0.2;

    // Tool calls are important
    if (message.role === "tool") score += 0.15;

    return Math.min(score, 1.0);
  }

  /**
   * Get available token budget
   */
  getAvailableTokens(): number {
    return this.config.maxTokens - this.config.reserveTokens;
  }

  /**
   * Check if compression is needed
   */
  needsCompression(messages: ContextMessage[]): boolean {
    const totalTokens = messages.reduce((sum, msg) => sum + msg.tokens, 0);
    const availableTokens = this.getAvailableTokens();
    const usageRatio = totalTokens / availableTokens;
    
    return usageRatio >= this.config.compressionThreshold;
  }

  /**
   * Compress messages using sliding window strategy
   */
  compressSlidingWindow(
    messages: ContextMessage[],
    targetTokens: number,
  ): ContextMessage[] {
    const keepRecent = this.config.keepRecentMessages;
    const recentMessages = messages.slice(-keepRecent);
    const oldMessages = messages.slice(0, -keepRecent);

    if (oldMessages.length === 0) {
      return recentMessages;
    }

    // Calculate tokens in recent messages
    const recentTokens = recentMessages.reduce((sum, msg) => sum + msg.tokens, 0);
    const remainingBudget = targetTokens - recentTokens;

    if (remainingBudget <= 0) {
      // Even recent messages exceed budget - keep only most recent
      return this.compressToFit(recentMessages, targetTokens);
    }

    // Summarize old messages to fit remaining budget
    const summary = this.summarizeMessages(oldMessages, remainingBudget);
    
    if (summary) {
      return [
        {
          role: "system",
          content: summary,
          timestamp: oldMessages[0]?.timestamp || Date.now(),
          tokens: this.estimateTokens(summary),
          compressed: true,
          summary: summary,
          originalLength: oldMessages.length,
        },
        ...recentMessages,
      ];
    }

    return recentMessages;
  }

  /**
   * Compress messages using importance-based strategy
   */
  compressImportanceBased(
    messages: ContextMessage[],
    targetTokens: number,
  ): ContextMessage[] {
    // Calculate importance for all messages
    const messagesWithImportance = messages.map((msg, idx) => ({
      ...msg,
      importance: this.calculateImportance(msg, idx, messages.length),
    }));

    // Sort by importance (descending)
    const sorted = [...messagesWithImportance].sort((a, b) => 
      (b.importance || 0) - (a.importance || 0)
    );

    // Keep most important messages that fit
    const result: ContextMessage[] = [];
    let currentTokens = 0;

    for (const msg of sorted) {
      if (currentTokens + msg.tokens <= targetTokens) {
        result.push(msg);
        currentTokens += msg.tokens;
      }
    }

    // Restore original order
    return result.sort((a, b) => {
      const aIdx = messages.findIndex(m => m === a);
      const bIdx = messages.findIndex(m => m === b);
      return aIdx - bIdx;
    });
  }

  /**
   * Compress messages using progressive summary strategy
   */
  compressProgressiveSummary(
    messages: ContextMessage[],
    targetTokens: number,
  ): ContextMessage[] {
    const keepRecent = this.config.keepRecentMessages;
    const recentMessages = messages.slice(-keepRecent);
    const oldMessages = messages.slice(0, -keepRecent);

    if (oldMessages.length === 0) {
      return recentMessages;
    }

    // Group old messages into chunks and summarize each
    const chunkSize = Math.max(5, Math.floor(oldMessages.length / 3));
    const chunks: ContextMessage[][] = [];
    
    for (let i = 0; i < oldMessages.length; i += chunkSize) {
      chunks.push(oldMessages.slice(i, i + chunkSize));
    }

    const summaries: ContextMessage[] = [];
    const recentTokens = recentMessages.reduce((sum, msg) => sum + msg.tokens, 0);
    const budgetPerChunk = Math.floor((targetTokens - recentTokens) / chunks.length);

    for (const chunk of chunks) {
      const summary = this.summarizeMessages(chunk, budgetPerChunk);
      if (summary) {
        summaries.push({
          role: "system",
          content: summary,
          timestamp: chunk[0]?.timestamp || Date.now(),
          tokens: this.estimateTokens(summary),
          compressed: true,
          summary: summary,
          originalLength: chunk.length,
        });
      }
    }

    return [...summaries, ...recentMessages];
  }

  /**
   * Compress messages to fit target token budget
   */
  compressToFit(messages: ContextMessage[], targetTokens: number): ContextMessage[] {
    const result: ContextMessage[] = [];
    let currentTokens = 0;

    // Keep messages from most recent backwards until we hit limit
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (currentTokens + msg.tokens <= targetTokens) {
        result.unshift(msg);
        currentTokens += msg.tokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Summarize a group of messages
   */
  summarizeMessages(messages: ContextMessage[], maxTokens: number): string | null {
    if (messages.length === 0) return null;

    // Simple summarization: extract key points
    const keyPoints: string[] = [];
    let currentTokens = 0;

    for (const msg of messages) {
      if (msg.role === "user") {
        const summary = this.extractKeyPoints(msg.content, 50);
        if (currentTokens + this.estimateTokens(summary) <= maxTokens) {
          keyPoints.push(`User: ${summary}`);
          currentTokens += this.estimateTokens(summary);
        }
      } else if (msg.role === "assistant") {
        const summary = this.extractKeyPoints(msg.content, 50);
        if (currentTokens + this.estimateTokens(summary) <= maxTokens) {
          keyPoints.push(`Assistant: ${summary}`);
          currentTokens += this.estimateTokens(summary);
        }
      }
    }

    if (keyPoints.length === 0) return null;

    return `[Compressed context from ${messages.length} earlier messages]\n\n${keyPoints.join("\n")}`;
  }

  /**
   * Extract key points from text (simple heuristic)
   */
  extractKeyPoints(text: string, maxLength: number): string {
    // Remove extra whitespace
    const cleaned = text.trim().replace(/\s+/g, " ");
    
    // If short enough, return as-is
    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Try to find sentence boundaries
    const sentences = cleaned.split(/[.!?]\s+/);
    if (sentences.length > 1) {
      // Take first sentence if it's reasonable
      if (sentences[0].length <= maxLength) {
        return sentences[0] + "...";
      }
    }

    // Fallback: truncate with ellipsis
    return cleaned.substring(0, maxLength - 3) + "...";
  }

  /**
   * Compress context using configured strategy
   */
  compressContext(
    messages: ContextMessage[],
    targetTokens?: number,
  ): ContextMessage[] {
    const availableTokens = targetTokens || this.getAvailableTokens();
    
    if (!this.needsCompression(messages)) {
      return messages;
    }

    switch (this.config.compressionStrategy) {
      case "sliding-window":
        return this.compressSlidingWindow(messages, availableTokens);
      
      case "importance-based":
        return this.compressImportanceBased(messages, availableTokens);
      
      case "progressive-summary":
        return this.compressProgressiveSummary(messages, availableTokens);
      
      case "hybrid": {
        // Try sliding window first, then importance if still too large
        let compressed = this.compressSlidingWindow(messages, availableTokens);
        const compressedTokens = compressed.reduce((sum, msg) => sum + msg.tokens, 0);
        
        if (compressedTokens > availableTokens) {
          compressed = this.compressImportanceBased(compressed, availableTokens);
        }
        
        return compressed;
      }
      
      default:
        return this.compressToFit(messages, availableTokens);
    }
  }

  /**
   * Prepare messages for context, applying compression if needed
   */
  prepareContext(
    messages: Array<{ role: string; content: string; timestamp?: number }>,
    systemPromptTokens?: number,
  ): ContextMessage[] {
    // Convert to ContextMessage format
    const contextMessages: ContextMessage[] = messages.map((msg, idx) => ({
      role: msg.role as ContextMessage["role"],
      content: msg.content,
      timestamp: msg.timestamp || Date.now() - (messages.length - idx) * 1000,
      tokens: this.estimateTokens(msg.content),
    }));

    // Calculate total tokens including system prompt
    const systemTokens = systemPromptTokens || 0;
    const messageTokens = contextMessages.reduce((sum, msg) => sum + msg.tokens, 0);
    const totalTokens = systemTokens + messageTokens;

    // If within limits, return as-is
    if (totalTokens <= this.config.maxTokens) {
      return contextMessages;
    }

    // Need compression - adjust target to account for system prompt
    const targetTokens = this.config.maxTokens - systemTokens - this.config.reserveTokens;
    
    return this.compressContext(contextMessages, targetTokens);
  }

  /**
   * Load context state from disk
   */
  loadState(landDir: string, sessionId: string): ContextState | null {
    const memoryDir = resolveMemoryDir(landDir);
    const statePath = join(memoryDir, "short", `${sessionId}.context.json`);

    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const data = readFileSync(statePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      console.warn(`Failed to load context state:`, error);
      return null;
    }
  }

  /**
   * Save context state to disk
   */
  saveState(landDir: string, state: ContextState): void {
    const memoryDir = resolveMemoryDir(landDir);
    const shortDir = join(memoryDir, "short");
    
    if (!existsSync(shortDir)) {
      mkdirSync(shortDir, { recursive: true });
    }

    const statePath = join(shortDir, `${state.sessionId}.context.json`);

    try {
      writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save context state:`, error);
    }
  }

  /**
   * Update context state after compression
   */
  updateState(
    landDir: string,
    sessionId: string,
    tokensBefore: number,
    tokensAfter: number,
    messagesCompressed: number,
  ): void {
    const existing = this.loadState(landDir, sessionId);
    
    const state: ContextState = {
      sessionId,
      totalTokens: tokensAfter,
      messageCount: existing?.messageCount || 0,
      compressedCount: (existing?.compressedCount || 0) + messagesCompressed,
      lastCompressionAt: Date.now(),
      compressionHistory: [
        ...(existing?.compressionHistory || []),
        {
          timestamp: Date.now(),
          tokensBefore,
          tokensAfter,
          messagesCompressed,
        },
      ].slice(-10), // Keep last 10 compression events
    };

    this.saveState(landDir, state);
  }
}
