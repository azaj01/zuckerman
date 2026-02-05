import type { GatewayClient } from "../gateway/client";

export interface StreamingState {
  conversationId: string;
  runId: string | null;
  isStreaming: boolean;
  startedAt: number | null;
}

/**
 * Streaming service - tracks streaming state per conversation
 * 
 * Features:
 * - Tracks which conversations are currently streaming
 * - Listens to gateway events to update state automatically
 * - Provides subscription API for reactive updates
 * - Single source of truth for streaming state
 */
export class StreamingService {
  private streamingStates = new Map<string, StreamingState>();
  private listeners = new Set<(states: Map<string, StreamingState>) => void>();

  constructor(private client: GatewayClient) {
    this.setupEventListeners();
  }

  /**
   * Set up event listeners to track streaming lifecycle
   */
  private setupEventListeners(): void {
    const removeListener = this.client.addEventListener((event) => {
      if (!event.event.startsWith("agent.stream.")) return;

      const payload = event.payload as {
        conversationId?: string;
        runId?: string;
        phase?: "start" | "end" | "error";
      };

      if (!payload.conversationId) return;

      const conversationId = payload.conversationId;
      const eventType = event.event.replace("agent.stream.", "");

      if (eventType === "lifecycle" && payload.phase === "start") {
        this.setStreaming(conversationId, payload.runId || null);
      } else if (
        eventType === "lifecycle" &&
        (payload.phase === "end" || payload.phase === "error")
      ) {
        this.clearStreaming(conversationId);
      } else if (eventType === "done") {
        this.clearStreaming(conversationId);
      }
    });
  }

  /**
   * Mark a conversation as streaming
   */
  private setStreaming(conversationId: string, runId: string | null): void {
    this.streamingStates.set(conversationId, {
      conversationId,
      runId,
      isStreaming: true,
      startedAt: Date.now(),
    });
    this.notifyListeners();
  }

  /**
   * Clear streaming state for a conversation
   */
  private clearStreaming(conversationId: string): void {
    this.streamingStates.delete(conversationId);
    this.notifyListeners();
  }

  /**
   * Check if a conversation is currently streaming
   */
  isStreaming(conversationId: string): boolean {
    return this.streamingStates.has(conversationId);
  }

  /**
   * Get all conversation IDs that are currently streaming
   */
  getStreamingConversations(): Set<string> {
    return new Set(this.streamingStates.keys());
  }

  /**
   * Get streaming state for a specific conversation
   */
  getStreamingState(conversationId: string): StreamingState | undefined {
    return this.streamingStates.get(conversationId);
  }

  /**
   * Subscribe to streaming state changes
   * Returns unsubscribe function
   */
  subscribe(listener: (states: Map<string, StreamingState>) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(new Map(this.streamingStates));
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    const currentStates = new Map(this.streamingStates);
    this.listeners.forEach((listener) => {
      try {
        listener(currentStates);
      } catch (err) {
        console.error("Error in streaming state listener:", err);
      }
    });
  }
}
