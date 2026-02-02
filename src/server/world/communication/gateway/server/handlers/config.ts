import type { GatewayRequestHandlers } from "../types.js";
import { loadConfig, saveConfig } from "@server/world/config/index.js";

export interface LLMModel {
  id: string;
  name: string;
}

/**
 * Extract date from model ID if it contains a date pattern (e.g., claude-3-5-sonnet-20241022)
 */
function extractDateFromId(id: string): string | undefined {
  // Try to find YYYYMMDD pattern in the ID
  const dateMatch = id.match(/(\d{8})/);
  if (dateMatch) {
    const dateStr = dateMatch[1];
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}T00:00:00Z`;
  }
  return undefined;
}

export function createConfigHandlers(): Partial<GatewayRequestHandlers> {
  return {
    "config.update": async ({ respond, params }) => {
      try {
        const updates = params?.updates as Record<string, unknown> | undefined;
        if (!updates) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing updates parameter",
          });
          return;
        }

        const config = await loadConfig();
        
        // Deep merge updates into config
        const updated = deepMerge(config, updates);
        await saveConfig(updated);
        
        respond(true, { updated: true });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to update config",
        });
      }
    },

    "config.get": async ({ respond }) => {
      try {
        const config = await loadConfig();
        respond(true, { config });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to load config",
        });
      }
    },

    "llm.models": async ({ respond, params }) => {
      try {
        const provider = params?.provider as string | undefined;
        if (!provider) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing provider parameter",
          });
          return;
        }

        // Fetch models from Anthropic API
        if (provider === "anthropic") {
          const config = await loadConfig();
          const apiKey = config.llm?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY;

          if (!apiKey) {
            respond(false, undefined, {
              code: "MISSING_API_KEY",
              message: "Anthropic API key is required to fetch models",
            });
            return;
          }

          try {
            const response = await fetch("https://api.anthropic.com/v1/models", {
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
              },
            });

            if (!response.ok) {
              throw new Error(`Anthropic API error: ${response.status}`);
            }

            const data = (await response.json()) as {
              data?: Array<{
                id: string;
                display_name?: string;
                created_at?: string;
              }>;
            };

            const models =
              data.data
                ?.map((model) => ({
                  id: model.id,
                  name: model.display_name || model.id,
                  createdAt: model.created_at || extractDateFromId(model.id),
                }))
                .sort((a, b) => {
                  // Sort by date descending (newest first)
                  const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return dateB - dateA;
                }) || [];

            respond(true, { models });
          } catch (err) {
            respond(false, undefined, {
              code: "FETCH_ERROR",
              message: err instanceof Error ? err.message : "Failed to fetch models from Anthropic",
            });
          }
          return;
        }

        // Fetch models from OpenAI API
        if (provider === "openai") {
          const config = await loadConfig();
          const apiKey = config.llm?.openai?.apiKey || process.env.OPENAI_API_KEY;

          if (!apiKey) {
            respond(false, undefined, {
              code: "MISSING_API_KEY",
              message: "OpenAI API key is required to fetch models",
            });
            return;
          }

          try {
            const response = await fetch("https://api.openai.com/v1/models", {
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            });

            if (!response.ok) {
              throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = (await response.json()) as {
              data?: Array<{
                id: string;
                created?: number;
              }>;
            };

            // Filter to only include chat models (gpt-* models)
            const models =
              data.data
                ?.filter((model) => model.id.startsWith("gpt-"))
                .map((model) => ({
                  id: model.id,
                  name: model.id.replace("gpt-", "GPT-").replace(/-/g, " "),
                  createdAt: model.created ? new Date(model.created * 1000).toISOString() : extractDateFromId(model.id),
                }))
                .sort((a, b) => {
                  // Sort by date descending (newest first)
                  const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return dateB - dateA;
                }) || [];

            respond(true, { models });
          } catch (err) {
            respond(false, undefined, {
              code: "FETCH_ERROR",
              message: err instanceof Error ? err.message : "Failed to fetch models from OpenAI",
            });
          }
          return;
        }

        // Fetch models from OpenRouter API
        if (provider === "openrouter") {
          const config = await loadConfig();
          const apiKey = config.llm?.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;

          if (!apiKey) {
            respond(false, undefined, {
              code: "MISSING_API_KEY",
              message: "OpenRouter API key is required to fetch models",
            });
            return;
          }

          const apiUrl = "https://openrouter.ai/api/v1/models";

          try {
            const response = await fetch(apiUrl, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            });

            if (!response.ok) {
              throw new Error(`OpenRouter API error: ${response.status}`);
            }

            const data = (await response.json()) as {
              data?: Array<{
                id: string;
                name?: string;
                description?: string;
                created?: number;
              }>;
            };

            const models =
              data.data
                ?.map((model) => ({
                  id: model.id,
                  name: model.name || model.id,
                  createdAt: model.created ? new Date(model.created * 1000).toISOString() : extractDateFromId(model.id),
                }))
                .sort((a, b) => {
                  // Sort by date descending (newest first)
                  const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return dateB - dateA;
                }) || [];

            respond(true, { models });
          } catch (err) {
            respond(false, undefined, {
              code: "FETCH_ERROR",
              message: err instanceof Error ? err.message : "Failed to fetch models from OpenRouter",
            });
          }
          return;
        }

        respond(false, undefined, {
          code: "INVALID_PROVIDER",
          message: `Unknown provider: ${provider}`,
        });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to fetch models",
        });
      }
    },
  };
}

function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === "object" && !Array.isArray(item);
}
