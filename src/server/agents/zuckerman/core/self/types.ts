export interface BrainPart {
  id: string;
  name: string;
  maxIterations?: number;
  toolsAllowed?: boolean;
  getPrompt: (goal: string, workingMemory: string[], historyText: string) => string;
}
