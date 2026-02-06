/**
 * Temporal Planning - Time-based scheduling
 * Manages scheduled tasks and time triggers
 */

import type { GoalTaskNode } from "../types.js";

/**
 * Temporal Scheduler
 */
export class TemporalScheduler {
  /**
   * Check if scheduled task is due
   */
  isDue(node: GoalTaskNode): boolean {
    if (node.type !== "task") {
      return false;
    }

    const triggerTime = node.metadata?.triggerTime as number | undefined;
    if (!triggerTime) {
      return false;
    }

    return Date.now() >= triggerTime;
  }

  /**
   * Get time until task is due (milliseconds)
   */
  getTimeUntilDue(node: GoalTaskNode): number | null {
    if (node.type !== "task") {
      return null;
    }

    const triggerTime = node.metadata?.triggerTime as number | undefined;
    if (!triggerTime) {
      return null;
    }

    return Math.max(0, triggerTime - Date.now());
  }

  /**
   * Filter tasks that are due
   */
  filterDueTasks(nodes: GoalTaskNode[]): GoalTaskNode[] {
    return nodes.filter((node) => this.isDue(node));
  }

  /**
   * Sort tasks by due time (earliest first)
   */
  sortByDueTime(nodes: GoalTaskNode[]): GoalTaskNode[] {
    return nodes
      .filter((node) => node.type === "task" && node.metadata?.triggerTime)
      .sort((a, b) => {
        const timeA = (a.metadata?.triggerTime as number) || Infinity;
        const timeB = (b.metadata?.triggerTime as number) || Infinity;
        return timeA - timeB;
      });
  }
}
