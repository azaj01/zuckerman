
// ============================================================================
// Core Types
// ============================================================================

export interface Goal {
  id: string;
  description: string;
  status: GoalStatus;
  subGoals?: Goal[];
}

export type GoalStatus = "pending" | "active" | "completed" | "failed";

// ============================================================================
// Module System
// ============================================================================

export interface ModuleInput {
  userMessage: string;
  state: string;
}

export interface Proposal {
  module: string;
  confidence: number; // 0.0–1.0
  priority: number;   // 0-10
  payload: unknown;
  reasoning: string;
}

// ============================================================================
// Action System
// ============================================================================

export enum Action {
  Respond = "respond",
  Decompose = "decompose",
  CallTool = "call_tool",
  Termination = "termination",
}

export interface ActionPayload {
  respond?: { message: string };
  decompose?: { goals: Goal[] };
  call_tool?: unknown;
  termination?: { message?: string };
}

// ============================================================================
// Decision System
// ============================================================================

export interface Decision {
  action: Action | Action[];
  payload: unknown | unknown[];
  stateUpdates: StateUpdates;
  reasoning: string;
}

export interface StateUpdates {
  goals?: Goal[];
  memories?: string[];
}

// ============================================================================
// Working Memory
// ============================================================================

export interface WorkingMemory {
  goals: Goal[];
  memories: string[];
}
