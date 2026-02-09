export interface Goal {
  id: string;
  description: string;
  status: GoalStatus;
  subGoals?: Goal[];
}

export type GoalStatus = "pending" | "active" | "completed" | "failed";

export interface StateUpdates {
  goals?: Goal[];
  memories?: string[];
}

export interface WorkingMemory {
  goals: Goal[];
  memories: string[];
}

export interface BrainPart {
  id: string;
  name: string;
  getPrompt: (goal: string, workingMemory: string[], historyText: string) => string;
}

export interface BrainGoal {
  id: string;
  description: string;
  brainPartId: string;
}
