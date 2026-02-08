import type { LLMModel } from "@server/world/providers/llm/index.js";
import type { Proposal } from "../types.js";

export class ReflectionModule {
  constructor(
    private judgeModel: LLMModel,
    private systemPrompt: string
  ) {}

  async run(params: {
    userMessage: string;
    state: string;
  }): Promise<Proposal | null> {
    const prompt = `You are the Reflection Module — the agent's capacity for self-questioning and meta-cognitive awareness.

Your role is to examine assumptions, identify knowledge gaps, and surface uncertainties that might affect decision-making.

Current user input: "${params.userMessage}"
Current state summary: ${params.state}

Analyze the situation and ask yourself:

1. **Assumption Validation**
   - What assumptions are we making that might be incorrect?
   - Are we taking certain facts or capabilities for granted?
   - What beliefs about the problem or solution need verification?

2. **Knowledge Gaps**
   - What information are we missing that could change our approach?
   - What don't we understand about the problem domain?
   - Are there unknowns that could invalidate our current strategy?

3. **Approach Scrutiny**
   - Are we following a pattern without questioning if it's appropriate?
   - Is there a better way we haven't considered?
   - Are we confident in our approach, or just defaulting to familiar methods?

4. **Meta-Cognitive Awareness**
   - What questions should we be asking but aren't?
   - What perspectives are we overlooking?
   - Are we being thorough enough in our analysis?

Based on your reflection, propose adjustments when you identify meaningful uncertainties or gaps worth addressing.

IMPORTANT: If you don't find significant assumptions to challenge, knowledge gaps to highlight, or uncertainties worth addressing, return null or set confidence to 0.0. Only propose something if you have a clear, valuable contribution that meaningfully improves understanding or decision-making.

Output ONLY valid JSON matching the Proposal structure:
{
  "module": "reflection",
  "confidence": 0.0-1.0,
  "priority": 0-10,
  "payload": {
    "adjustment": "specific change or course correction based on your reflection",
    "learning": "key insight or understanding gained from questioning assumptions",
    "questions": ["specific probing question 1", "specific probing question 2", ...]
  },
  "reasoning": "brief explanation of why these reflections matter and what they reveal"
}`;

    try {
      const response = await this.judgeModel.call({
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        responseFormat: "json_object",
      });
      return this.parseResponse(response.content);
    } catch (error) {
      console.warn(`[ReflectionModule] Validation failed:`, error);
      return null;
    }
  }

  private parseResponse(content: string): Proposal | null {
    try {
      const parsed = JSON.parse(content.trim());
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      const payload = parsed.payload || {};
      
      // Return null if confidence is very low or payload is empty - module doesn't think it can help
      if (confidence < 0.1 || Object.keys(payload).length === 0) {
        return null;
      }
      
      return {
        module: String(parsed.module || "reflection"),
        confidence,
        priority: Math.max(0, Math.min(10, Number(parsed.priority) || 0)),
        payload,
        reasoning: String(parsed.reasoning || "No reasoning provided"),
      };
    } catch (error) {
      console.warn(`[ReflectionModule] Parse failed:`, error);
      return null;
    }
  }
}
