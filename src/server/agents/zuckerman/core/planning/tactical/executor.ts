/**
 * Tactical Planning - Step-by-step execution
 * Tracks task execution with step sequences
 */

import type { GoalTaskNode } from "../types.js";
import { StepSequenceManager } from "./steps.js";
import { TacticalAgent } from "./agent.js";
import type { TaskStep } from "./steps.js";

/**
 * Task Executor
 */
export class TacticalExecutor {
  private currentTask: GoalTaskNode | null = null;
  private startTime: number | null = null;
  private steps: TaskStep[] = [];
  private stepManager: StepSequenceManager;
  private agent: TacticalAgent;
  private readonly timeoutMs: number = 60 * 60 * 1000; // 1 hour default timeout

  constructor() {
    this.stepManager = new StepSequenceManager();
    this.agent = new TacticalAgent();
  }

  /**
   * Start executing a task
   */
  startExecution(task: GoalTaskNode): void {
    if (task.type !== "task") {
      throw new Error("Can only execute tasks, not goals");
    }
    
    this.currentTask = task;
    this.startTime = Date.now();
    task.taskStatus = "active";
    task.progress = 0;
    task.updatedAt = Date.now();

    // Use steps from task metadata if available, otherwise create
    if (task.metadata?.steps && Array.isArray(task.metadata.steps)) {
      this.steps = task.metadata.steps as TaskStep[];
    } else {
      this.steps = this.stepManager.createSteps(task);
    }
  }

  /**
   * Set steps for current task
   */
  setSteps(steps: TaskStep[]): void {
    this.steps = steps;
    if (this.currentTask) {
      this.currentTask.metadata = {
        ...this.currentTask.metadata,
        steps,
      };
    }
  }

  /**
   * Update task progress
   */
  updateProgress(task: GoalTaskNode, progress: number): void {
    if (task.id !== this.currentTask?.id || task.type !== "task") {
      return;
    }

    task.progress = Math.max(0, Math.min(100, progress));
    task.updatedAt = Date.now();
  }

  /**
   * Complete current step
   */
  completeCurrentStep(result?: unknown): boolean {
    if (!this.currentTask) {
      return false;
    }

    const currentStep = this.stepManager.getCurrentStep(this.steps);
    if (!currentStep) {
      return false;
    }

    this.stepManager.completeStep(this.steps, currentStep.id, result);

    // Update task progress based on steps
    const progress = this.stepManager.calculateProgress(this.steps);
    this.updateProgress(this.currentTask, progress);

    return true;
  }

  /**
   * Complete task execution
   */
  completeExecution(task: GoalTaskNode, result?: unknown): void {
    if (task.id !== this.currentTask?.id || task.type !== "task") {
      return;
    }

    task.taskStatus = "completed";
    task.progress = 100;
    task.result = result;
    task.updatedAt = Date.now();

    this.currentTask = null;
    this.startTime = null;
    this.steps = [];
  }

  /**
   * Fail task execution
   */
  failExecution(task: GoalTaskNode, error: string): void {
    if (task.id !== this.currentTask?.id || task.type !== "task") {
      return;
    }

    task.taskStatus = "failed";
    task.error = error;
    task.updatedAt = Date.now();

    this.currentTask = null;
    this.startTime = null;
    this.steps = [];
  }

  /**
   * Get current active task
   */
  getCurrentTask(): GoalTaskNode | null {
    return this.currentTask ? { ...this.currentTask } : null;
  }

  /**
   * Get current step
   */
  getCurrentStep(): TaskStep | null {
    return this.stepManager.getCurrentStep(this.steps);
  }

  /**
   * Get all steps
   */
  getSteps(): TaskStep[] {
    return [...this.steps];
  }

  /**
   * Check if all steps are completed
   */
  areAllStepsCompleted(): boolean {
    return this.stepManager.areAllStepsCompleted(this.steps);
  }

  /**
   * Check if task is active
   */
  isTaskActive(taskId: string): boolean {
    return this.currentTask?.id === taskId;
  }

  /**
   * Check if current task has timed out
   */
  hasTimedOut(): boolean {
    if (!this.startTime) {
      return false;
    }

    const elapsed = Date.now() - this.startTime;
    return elapsed > this.timeoutMs;
  }

  /**
   * Get execution time for current task
   */
  getExecutionTime(): number | null {
    if (!this.startTime) {
      return null;
    }

    return Date.now() - this.startTime;
  }

  /**
   * Clear current task
   */
  clear(): void {
    this.currentTask = null;
    this.startTime = null;
    this.steps = [];
  }
}
