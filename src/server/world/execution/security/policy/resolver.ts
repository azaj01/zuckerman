import type {
  SecurityConfig,
  SecurityContext,
  ToolPolicy,
  ExecutionSecurity,
  SandboxConfig,
  WorkspaceAccess,
} from "../types.js";
import type { ConversationType } from "@server/agents/zuckerman/conversations/types.js";

/**
 * Resolve security context for a conversation
 */
export function resolveSecurityContext(
  config: SecurityConfig | undefined,
  conversationId: string,
  conversationType: ConversationType,
  agentId: string,
): SecurityContext {
  const sandboxConfig = config?.sandbox ?? { mode: "off" };
  const isSandboxed = shouldSandbox(sandboxConfig, conversationType);

  // Resolve tool policy
  const toolPolicy = resolveToolPolicy(config, conversationType, isSandboxed);

  // Resolve execution policy
  const executionPolicy = resolveExecutionPolicy(config, conversationType);

  // Resolve workspace access
  const workspaceAccess = resolveWorkspaceAccess(config, conversationType, isSandboxed);

  return {
    conversationId,
    conversationType,
    agentId,
    isSandboxed,
    toolPolicy,
    executionPolicy,
    workspaceAccess,
  };
}

function shouldSandbox(
  sandboxConfig: SandboxConfig,
  conversationType: ConversationType,
): boolean {
  if (sandboxConfig.mode === "off" || sandboxConfig.enabled === false) {
    return false;
  }

  if (sandboxConfig.mode === "all") {
    return true;
  }

  // "non-main" mode: sandbox non-main conversations
  if (sandboxConfig.mode === "non-main") {
    return conversationType !== "main";
  }

  return false;
}

function resolveToolPolicy(
  config: SecurityConfig | undefined,
  conversationType: ConversationType,
  isSandboxed: boolean,
): ToolPolicy {
  // Start with global tool policy
  const globalPolicy: ToolPolicy = {
    profile: config?.tools?.profile ?? "full",
    allow: config?.tools?.allow,
    deny: config?.tools?.deny,
  };

  // Apply conversation-specific overrides
  const conversationConfig = config?.conversations?.[conversationType];
  if (conversationConfig?.tools) {
    const conversationPolicy: ToolPolicy = {
      ...globalPolicy,
      profile: conversationConfig.tools.profile ?? globalPolicy.profile,
      allow: conversationConfig.tools.allow ?? globalPolicy.allow,
      deny: [
        ...(globalPolicy.deny ?? []),
        ...(conversationConfig.tools.deny ?? []),
      ],
    };
    
    // Apply sandbox-specific restrictions if sandboxed
    if (isSandboxed && config?.tools?.sandbox?.tools) {
      return {
        ...conversationPolicy,
        allow: config.tools.sandbox.tools.allow ?? conversationPolicy.allow,
        deny: [
          ...(conversationPolicy.deny ?? []),
          ...(config.tools.sandbox.tools.deny ?? []),
        ],
      };
    }
    
    return conversationPolicy;
  }

  // Apply sandbox-specific restrictions if sandboxed
  if (isSandboxed && config?.tools?.sandbox?.tools) {
    return {
      ...globalPolicy,
      allow: config.tools.sandbox.tools.allow ?? globalPolicy.allow,
      deny: [
        ...(globalPolicy.deny ?? []),
        ...(config.tools.sandbox.tools.deny ?? []),
      ],
    };
  }

  return globalPolicy;
}

function resolveExecutionPolicy(
  config: SecurityConfig | undefined,
  conversationType: ConversationType,
): ExecutionSecurity {
  const globalExecution = config?.execution ?? {};
  const conversationExecution = config?.conversations?.[conversationType]?.execution ?? {};

  return {
    allowlist: conversationExecution.allowlist ?? globalExecution.allowlist,
    denylist: conversationExecution.denylist ?? globalExecution.denylist,
    timeout: conversationExecution.timeout ?? globalExecution.timeout ?? 30000,
    maxOutput: conversationExecution.maxOutput ?? globalExecution.maxOutput ?? 10485760, // 10MB
    maxProcesses: conversationExecution.maxProcesses ?? globalExecution.maxProcesses,
    allowedPaths: conversationExecution.allowedPaths ?? globalExecution.allowedPaths,
    blockedPaths: conversationExecution.blockedPaths ?? globalExecution.blockedPaths,
  };
}

function resolveWorkspaceAccess(
  config: SecurityConfig | undefined,
  conversationType: ConversationType,
  isSandboxed: boolean,
): WorkspaceAccess {
  if (!isSandboxed) {
    return "rw"; // Host access is read-write
  }

  const sandboxConfig = config?.sandbox;
  const conversationConfig = config?.conversations?.[conversationType];

  // Conversation-specific override
  if (conversationConfig?.sandbox === false) {
    return "rw";
  }

  // Sandbox workspace access
  return sandboxConfig?.workspaceAccess ?? "rw";
}
