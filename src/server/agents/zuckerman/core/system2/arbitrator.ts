import type { LLMModel } from "@server/world/providers/llm/index.js";
import type { Proposal, Decision, WorkingMemory, StateUpdates } from "./types.js";
import { Action } from "./types.js";

interface RecentMessage {
  role: string;
  content: string;
  timestamp?: number;
}

const ARBITRATOR_PROMPT = `
You are the Global Workspace — the central conscious brain of the agent.

Current working memory state:
{state}

Proposals from modules:
{proposals}

Recent messages since last iteration:
{recentMessages}

Your task:
- Read all proposals carefully
- Review recent messages to learn what happened (successes, failures, patterns)
- Decide the next action(s) based on the proposals and current state
- You can combine insights from multiple proposals
- You can return a SINGLE action or an ARRAY of actions to execute sequentially

Actions:
- "respond": Send message to user (continues cycle)
- "decompose": Break goal into sub-goals (continues cycle)
- "call_tool": Execute a tool (continues cycle)
- "termination": End processing cycle - use when task is complete or no further action needed

If using an array of actions, payload should be an array matching the actions (same length).

State updates:
- goals: Provide the complete list of current goals (replaces existing goals)
- memories: Provide the complete list of persistent working memory items (replaces existing memories). Include existing memories you want to keep plus any new ones. Based on recent messages, include specific details that will help avoid repeating ineffective methods:
  * What failed and why (include specific approaches, tools, or methods that didn't work)
  * What worked well (include specific approaches, tools, or methods that succeeded)
  * Lessons learned (with concrete details about methods to avoid or prefer)
  * Patterns observed (specific patterns in failures or successes)
  * Important insights (with actionable details for future decisions)
  When documenting failures, include enough detail about the method/approach used so it can be recognized and avoided in the future.
  Omit memories that are no longer relevant or have been superseded. Only include memories that are valuable for future interactions.

Output ONLY valid JSON:
{
  "action": "respond" | ["respond", "call_tool"] | "decompose" | "call_tool" | "termination",
  "payload": { ... } | [{ ... }, { ... }],
  "stateUpdates": {
    "goals": [...] | undefined,
    "memories": [...] | undefined
  },
  "reasoning": "brief explanation of your decision"
}
`;

export async function arbitrate(
  proposals: Proposal[],
  memory: WorkingMemory,
  judgeModel: LLMModel,
  systemPrompt: string,
  recentMessages: RecentMessage[] = []
): Promise<Decision | null> {
  if (proposals.length === 0) {
    console.warn("[Arbitrator] No proposals found");
    return null;
  }

  const recentMessagesText = recentMessages.length > 0
    ? recentMessages.map(m => `[${m.role}]: ${m.content?.substring(0, 300) || ''}`).join('\n')
    : 'No new messages since last iteration';

  const prompt = ARBITRATOR_PROMPT
    .replace('{proposals}', JSON.stringify(proposals, null, 2))
    .replace('{state}', JSON.stringify(memory, null, 2))
    .replace('{recentMessages}', recentMessagesText);

  try {
    const response = await judgeModel.call({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      responseFormat: "json_object",
    });

    const parsed = JSON.parse(response.content);
    
    const validActions = Object.values(Action);
    let action: Action | Action[];
    
    if (Array.isArray(parsed.action)) {
      action = parsed.action.filter((a: string) => validActions.includes(a as Action)) as Action[];
      if (action.length === 0) action = Action.Respond;
    } else {
      action = validActions.includes(parsed.action as Action) ? parsed.action as Action : Action.Respond;
    }

    return {
      action,
      payload: parsed.payload || (Array.isArray(action) ? [] : {}),
      stateUpdates: parsed.stateUpdates || {},
      reasoning: String(parsed.reasoning || "No reasoning provided"),
    };
  } catch (error) {
    console.error("[Arbitrator] Error:", error);
    return null;
  }
}
