import { useState, useEffect, useMemo } from "react";
import { useGatewayContext } from "../gateway/use-gateway-context";
import { serviceRegistry } from "../gateway/service-registry";
import type { StreamingService } from "./streaming-service";

/**
 * Hook to get the streaming service instance
 */
export function useStreamingService(): StreamingService | null {
  const { gatewayClient } = useGatewayContext();
  return useMemo(
    () => serviceRegistry.getService(gatewayClient, "streamingService"),
    [gatewayClient]
  );
}

/**
 * Hook to get all conversation IDs that are currently streaming
 * Updates reactively when streaming state changes
 */
export function useStreamingConversations(): Set<string> {
  const streamingService = useStreamingService();
  const [streamingConversations, setStreamingConversations] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!streamingService) {
      setStreamingConversations(new Set());
      return;
    }

    const unsubscribe = streamingService.subscribe((states) => {
      setStreamingConversations(new Set(states.keys()));
    });

    return unsubscribe;
  }, [streamingService]);

  return streamingConversations;
}

/**
 * Hook to check if a specific conversation is currently streaming
 * Updates reactively when streaming state changes
 */
export function useConversationStreaming(conversationId: string | null): boolean {
  const streamingService = useStreamingService();
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!streamingService || !conversationId) {
      setIsStreaming(false);
      return;
    }

    const unsubscribe = streamingService.subscribe((states) => {
      setIsStreaming(states.has(conversationId));
    });

    return unsubscribe;
  }, [streamingService, conversationId]);

  return isStreaming;
}
