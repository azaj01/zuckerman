/**
 * Contingency Planning Agent
 * Role: You handle task failures. Given a failed task, decide what to do next.
 */

import type { GoalTaskNode } from "../types.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";
import { randomUUID } from "node:crypto";

export interface FallbackDecision {
  shouldCreateFallback: boolean;
  fallbackTask?: GoalTaskNode;
  reasoning: string;
}

export class ContingencyAgent {
  private llmManager: LLMManager;

  constructor() {
    this.llmManager = LLMManager.getInstance();
  }

  /**
   * Handle task failure - decide fallback using LLM
   */
  async handleFailure(
    task: GoalTaskNode,
    error: string
  ): Promise<FallbackDecision> {
    if (task.type !== "task") {
      return {
        shouldCreateFallback: false,
        reasoning: "Can only create fallback for tasks",
      };
    }

    try {
      const model = await this.llmManager.fastCheap();

      const systemPrompt = `You are responsible for handling task failures. Your role is to decide what to do when a task fails.

Given a failed task and the error, decide if a fallback approach should be created. Return your decision as JSON.`;

      const context = `Task: ${task.title}
${task.description ? `Description: ${task.description}` : ""}
Error: ${error}
Progress: ${task.progress || 0}%`;

      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ];

      const response = await model.call({
        messages,
        temperature: 0.3,
        maxTokens: 500,
      });

      const content = response.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(jsonStr);

      if (!parsed.shouldCreateFallback) {
        return {
          shouldCreateFallback: false,
          reasoning: parsed.reasoning || "No fallback needed",
        };
      }

      // Create fallback task from LLM decision
      const fallbackTask: GoalTaskNode = {
        id: `${task.id}-fallback-${randomUUID().slice(0, 8)}`,
        type: "task",
        title: parsed.fallbackTitle || `Fallback: ${task.title}`,
        description: parsed.fallbackDescription || `Fallback for: ${task.title}. Original error: ${error}`,
        taskStatus: "pending",
        urgency: parsed.urgency || task.urgency || "medium",
        priority: parsed.priority ?? 0.5,
        source: task.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        children: [],
        order: 0,
        parentId: task.parentId,
        metadata: {
          ...task.metadata,
          isFallback: true,
          originalTaskId: task.id,
          originalError: error,
        },
      };

      return {
        shouldCreateFallback: true,
        fallbackTask,
        reasoning: parsed.reasoning || "Fallback created",
      };
    } catch (error) {
      console.warn(`[ContingencyAgent] Decision failed:`, error);
      return {
        shouldCreateFallback: false,
        reasoning: "LLM decision failed, no fallback",
      };
    }
  }
}
