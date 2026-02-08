import type { WorkingMemory, StateUpdates, Goal } from "./types.js";

export class WorkingMemoryManager {
  constructor(private memory: WorkingMemory) {}

  getState(): WorkingMemory {
    return this.memory;
  }

  update(updates: StateUpdates): void {
    const changes: string[] = [];

    if (updates.goals) {
      const before = this.memory.goals.length;
      this.memory.goals = updates.goals;
      changes.push(`goals: ${updates.goals.length - before > 0 ? '+' : ''}${updates.goals.length - before}`);
    }

    if (updates.memories) {
      const before = this.memory.memories.length;
      this.memory.memories = updates.memories;
      changes.push(`memories: ${updates.memories.length - before > 0 ? '+' : ''}${updates.memories.length - before} (replaced)`);
    }

    if (changes.length > 0) {
      console.log(`[WorkingMemory] Updated: ${changes.join(', ')}`);
    }
  }


  static initialize(relevantMemoriesText?: string): WorkingMemory {
    const memories: string[] = [];
    
    if (relevantMemoriesText) {
      const memoryLines = relevantMemoriesText.split('\n').filter(l => l.trim());
      memories.push(...memoryLines.slice(0, 10));
    }

    return {
      goals: [],
      memories,
    };
  }
}
