import { useState, useEffect, useCallback, useRef } from "react";
import { GatewayClient } from "../core/gateway/client";

export interface LLMModel {
  id: string;
  name: string;
}

export interface LLMProviderState {
  provider: "anthropic" | "openai" | "openrouter" | "mock" | null;
  apiKey: string;
  validated: boolean;
  error?: string;
  model?: LLMModel;
}

export interface UseLLMProviderOptions {
  gatewayClient: GatewayClient | null;
  provider: "anthropic" | "openai" | "openrouter" | "mock" | null;
  apiKey: string;
  validated: boolean;
  model?: LLMModel;
  onUpdate: (updates: Partial<LLMProviderState>) => void;
  autoFetchModels?: boolean;
}

export interface UseLLMProviderReturn {
  availableModels: LLMModel[];
  isLoadingModels: boolean;
  testingApiKey: boolean;
  validateApiKey: (key: string, provider: string) => boolean;
  testApiKey: () => Promise<void>;
  fetchModels: () => Promise<void>;
}

export function useLLMProvider({
  gatewayClient,
  provider,
  apiKey,
  validated,
  model,
  onUpdate,
  autoFetchModels = true,
}: UseLLMProviderOptions): UseLLMProviderReturn {
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const justFetchedModelsRef = useRef(false);
  const fetchingModelsRef = useRef(false);

  const validateApiKey = useCallback((key: string, providerName: string): boolean => {
    if (providerName === "anthropic") {
      return key.startsWith("sk-ant-");
    } else if (providerName === "openai") {
      return key.startsWith("sk-");
    } else if (providerName === "openrouter") {
      return key.startsWith("sk-or-");
    }
    return false;
  }, []);

  const fetchModels = useCallback(async () => {
    if (!gatewayClient?.isConnected() || !provider || provider === "mock") {
      setAvailableModels([]);
      return;
    }

    if (fetchingModelsRef.current) {
      return;
    }

    fetchingModelsRef.current = true;
    setIsLoadingModels(true);
    try {
      const response = await gatewayClient.request("llm.models", {
        provider,
      });

      if (response.ok && response.result) {
        const models = (response.result as { models: LLMModel[] }).models;
        setAvailableModels(models || []);

        // Set first model as default if none selected
        if (!model && models && models.length > 0) {
          onUpdate({ model: models[0] });
        }
      } else {
        setAvailableModels([]);
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
      fetchingModelsRef.current = false;
    }
  }, [gatewayClient, provider, model, onUpdate]);

  const testApiKey = useCallback(async () => {
    if (!provider || !apiKey) return;

    if (provider === "mock") {
      onUpdate({ validated: true });
      return;
    }

    if (!validateApiKey(apiKey, provider)) {
      onUpdate({
        validated: false,
        error: "Invalid API key format",
      });
      return;
    }

    setTestingApiKey(true);
    onUpdate({ error: undefined });

    try {
      // Test the API key format (basic validation)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Save API key after successful test
      if (window.electronAPI) {
        const keys: { anthropic?: string; openai?: string; openrouter?: string } = {};
        if (provider === "anthropic") {
          keys.anthropic = apiKey.trim();
        } else if (provider === "openai") {
          keys.openai = apiKey.trim();
        } else if (provider === "openrouter") {
          keys.openrouter = apiKey.trim();
        }

        const result = await window.electronAPI.saveApiKeys(keys);
        if (!result.success) {
          throw new Error(result.error || "Failed to save API key");
        }

        // Wait a bit for config to reload in gateway
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Fetch models after saving API key
      if (gatewayClient?.isConnected()) {
        justFetchedModelsRef.current = true;
        await fetchModels();
        setTimeout(() => {
          justFetchedModelsRef.current = false;
        }, 100);
      }

      onUpdate({
        validated: true,
        error: undefined,
      });
    } catch (error: any) {
      onUpdate({
        validated: false,
        error: error.message || "API key validation failed",
      });
      setAvailableModels([]);
    } finally {
      setTestingApiKey(false);
    }
  }, [provider, apiKey, validateApiKey, gatewayClient, fetchModels, onUpdate]);

  // Auto-fetch models when provider changes (if already validated)
  useEffect(() => {
    if (!autoFetchModels) return;

    // Skip if we just fetched models from testApiKey
    if (justFetchedModelsRef.current) {
      return;
    }

    // Skip if already fetching
    if (fetchingModelsRef.current) {
      return;
    }

    if (!gatewayClient?.isConnected() || !provider || provider === "mock") {
      setAvailableModels([]);
      return;
    }

    // Only fetch if we have a validated API key
    if (!validated) {
      setAvailableModels([]);
      return;
    }

    // For OpenRouter, we need an API key to fetch models
    if (provider === "openrouter" && !apiKey) {
      setAvailableModels([]);
      return;
    }

    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayClient?.isConnected(), provider, apiKey, validated, autoFetchModels]);

  return {
    availableModels,
    isLoadingModels,
    testingApiKey,
    validateApiKey,
    testApiKey,
    fetchModels,
  };
}
