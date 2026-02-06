/**
 * Contingency Planning - Fallback strategies
 * Handles fallback plans when tasks fail
 */

import type { GoalTaskNode } from "../types.js";
import { ContingencyAgent } from "./agent.js";

/**
 * Fallback Strategy Manager
 */
export class FallbackStrategyManager {
  private agent: ContingencyAgent;

  constructor() {
    this.agent = new ContingencyAgent();
  }

  /**
   * Handle task failure - get fallback plan using LLM
   */
  async handleFailure(task: GoalTaskNode, error: string): Promise<GoalTaskNode | null> {
    const decision = await this.agent.handleFailure(task, error);
    return decision.shouldCreateFallback ? decision.fallbackTask || null : null;
  }

  /**
   * Register fallback plan for a task (legacy - LLM decides fallbacks now)
   */
  registerFallback(taskId: string, fallbackDescription: string, priority: number = 0.5): string {
    // Legacy method - LLM now decides fallbacks dynamically
    return `${taskId}-fallback-registered`;
  }

  /**
   * Check if task has fallback (legacy - LLM decides fallbacks now)
   */
  hasFallback(taskId: string): boolean {
    // Legacy method - LLM now decides fallbacks dynamically
    return false;
  }
}
