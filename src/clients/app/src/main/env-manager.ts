import { loadConfig, saveConfig } from "@server/world/config/index.js";

/**
 * Read API keys from config.json
 */
export async function getApiKeys(): Promise<{
  anthropic?: string;
  openai?: string;
  openrouter?: string;
}> {
  const keys: { anthropic?: string; openai?: string; openrouter?: string } = {};

  try {
    const config = await loadConfig();
    if (config.llm?.anthropic?.apiKey) {
      keys.anthropic = config.llm.anthropic.apiKey;
    }
    if (config.llm?.openai?.apiKey) {
      keys.openai = config.llm.openai.apiKey;
    }
    if (config.llm?.openrouter?.apiKey) {
      keys.openrouter = config.llm.openrouter.apiKey;
    }
  } catch (error) {
    console.error("Error reading API keys from config:", error);
  }

  return keys;
}

/**
 * Save API keys to config.json only
 */
export async function saveApiKeys(keys: {
  anthropic?: string;
  openai?: string;
  openrouter?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await loadConfig();
    
    if (!config.llm) {
      config.llm = {};
    }
    if (keys.anthropic) {
      if (!config.llm.anthropic) {
        config.llm.anthropic = {};
      }
      config.llm.anthropic.apiKey = keys.anthropic;
    }
    if (keys.openai) {
      if (!config.llm.openai) {
        config.llm.openai = {};
      }
      config.llm.openai.apiKey = keys.openai;
    }
    if (keys.openrouter) {
      if (!config.llm.openrouter) {
        config.llm.openrouter = {};
      }
      config.llm.openrouter.apiKey = keys.openrouter;
    }
    
    await saveConfig(config);
    
    // Verify it was saved correctly - wait a bit for file system to sync
    await new Promise(resolve => setTimeout(resolve, 100));
    const verifyConfig = await loadConfig();
    
    const verificationErrors: string[] = [];
    if (keys.openrouter && !verifyConfig.llm?.openrouter?.apiKey) {
      verificationErrors.push("openrouter key not found after save");
    }
    if (keys.anthropic && !verifyConfig.llm?.anthropic?.apiKey) {
      verificationErrors.push("anthropic key not found after save");
    }
    if (keys.openai && !verifyConfig.llm?.openai?.apiKey) {
      verificationErrors.push("openai key not found after save");
    }
    
    if (verificationErrors.length > 0) {
      const errorMsg = `Verification failed: ${verificationErrors.join(", ")}`;
      console.error("[env-manager]", errorMsg);
      throw new Error(errorMsg);
    }

    // Set environment variables in current process (for immediate use)
    if (keys.anthropic) {
      process.env.ANTHROPIC_API_KEY = keys.anthropic;
    }
    if (keys.openai) {
      process.env.OPENAI_API_KEY = keys.openai;
    }
    if (keys.openrouter) {
      process.env.OPENROUTER_API_KEY = keys.openrouter;
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[env-manager] Error saving API keys:", errorMessage);
    return { success: false, error: `Failed to save API keys: ${errorMessage}` };
  }
}
