/**
 * Sleep mode consolidator - organizes and prepares memories for storage
 */

import type { ConsolidatedMemory, ContextMessage } from "./types.js";
import { calculateImportance } from "./summarizer.js";
import { categorizeMemory } from "./processor.js";

/**
 * Consolidate memories from conversation
 */
export function consolidateMemories(
  messages: ContextMessage[],
  conversationSummary: string,
): ConsolidatedMemory[] {
  const memories: ConsolidatedMemory[] = [];
  
  // Add conversation summary as a memory
  memories.push({
    content: conversationSummary,
    type: "event",
    importance: 0.7,
  });
  
  // Process important messages
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // Skip compressed/summarized messages
    if (msg.compressed) continue;
    
    // Only process user and assistant messages with substantial content
    if (msg.role === "user" || (msg.role === "assistant" && msg.tokens > 50)) {
      const importance = calculateImportance(msg, i, messages.length);
      
      // Only include if importance is above threshold
      if (importance > 0.4) {
        const type = categorizeMemory(msg.content);
        
        memories.push({
          content: msg.content,
          type,
          importance,
        });
      }
    }
  }
  
  // Sort by importance (descending)
  return memories.sort((a, b) => b.importance - a.importance);
}

/**
 * Format memories for daily log
 */
export function formatMemoriesForDailyLog(memories: ConsolidatedMemory[]): string {
  if (memories.length === 0) {
    return "";
  }
  
  const sections: string[] = [];
  
  // Group by type
  const byType: Record<ConsolidatedMemory["type"], ConsolidatedMemory[]> = {
    fact: [],
    preference: [],
    decision: [],
    event: [],
    learning: [],
  };
  
  for (const memory of memories) {
    byType[memory.type].push(memory);
  }
  
  // Format each type
  for (const [type, mems] of Object.entries(byType)) {
    if (mems.length > 0) {
      sections.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
      for (const mem of mems) {
        sections.push(`- ${mem.content}`);
      }
    }
  }
  
  return sections.join("\n\n");
}

/**
 * Format memories for long-term storage
 */
export function formatMemoriesForLongTerm(memories: ConsolidatedMemory[]): string {
  if (memories.length === 0) {
    return "";
  }
  
  const sections: string[] = [];
  
  // Group by type
  const byType: Record<ConsolidatedMemory["type"], ConsolidatedMemory[]> = {
    fact: [],
    preference: [],
    decision: [],
    event: [],
    learning: [],
  };
  
  for (const memory of memories) {
    byType[memory.type].push(memory);
  }
  
  // Format each type
  for (const [type, mems] of Object.entries(byType)) {
    if (mems.length > 0) {
      sections.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
      for (const mem of mems) {
        sections.push(`- ${mem.content}`);
      }
    }
  }
  
  return sections.join("\n\n");
}
