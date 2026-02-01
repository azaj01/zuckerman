import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GatewayClient } from "../../../core/gateway/client";
import { Server, Brain, Settings as SettingsIcon, Loader2, Trash2, Shield } from "lucide-react";
import { useGateway } from "../../../hooks/use-gateway";
import { GatewayLogsViewer } from "../../../components/gateway-logs-viewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearStorageByPrefix } from "../../../core/storage/local-storage";
import { GatewayView } from "./views/gateway-view";
import { LLMView } from "./views/llm-view";
import { SecurityView } from "./views/security-view";

interface SettingsProps {
  gatewayClient: GatewayClient | null;
  onClose?: () => void;
  onGatewayConfigChange?: (host: string, port: number) => void;
}

type SettingsTab = "gateway" | "llm" | "security" | "advanced";

interface SettingsState {
  gateway: {
    host: string;
    port: number;
    autoStart: boolean;
  };
  llmProvider: {
    provider: "anthropic" | "openai" | "openrouter" | "mock" | null;
    apiKey: string;
    validated: boolean;
    error?: string;
  };
  advanced: {
    autoReconnect: boolean;
    reconnectAttempts: number;
  };
}

export function SettingsView({
  gatewayClient,
  onClose,
  onGatewayConfigChange,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("gateway");
  const [settings, setSettings] = useState<SettingsState>(() => {
    const stored = localStorage.getItem("zuckerman:settings");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fallback to defaults
      }
    }
    return {
      gateway: {
        host: "127.0.0.1",
        port: 18789,
        autoStart: true,
      },
      llmProvider: {
        provider: null,
        apiKey: "",
        validated: false,
      },
      advanced: {
        autoReconnect: true,
        reconnectAttempts: 5,
      },
    };
  });
  const [testingApiKey, setTestingApiKey] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toolRestrictions, setToolRestrictions] = useState<{
    profile: "minimal" | "coding" | "messaging" | "full";
    enabledTools: Set<string>;
  }>({
    profile: "full",
    enabledTools: new Set(["terminal", "browser", "cron", "device", "filesystem", "canvas"]),
  });
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  
  const {
    serverStatus,
    isServerLoading,
    isServerStarting,
    isServerStopping,
    startServer,
    stopServer,
    checkServerStatus,
    startPolling,
    stopPolling,
  } = useGateway();

  useEffect(() => {
    // Load current settings when component mounts
    const stored = localStorage.getItem("zuckerman:settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
        // Check gateway status with loaded settings
        if (window.electronAPI && parsed.gateway) {
          checkServerStatus(parsed.gateway.host, parsed.gateway.port);
        }
      } catch {}
    } else {
      // Check gateway status with default settings
      if (window.electronAPI) {
        checkServerStatus(settings.gateway.host, settings.gateway.port);
      }
    }
    
    // Load API keys from Electron API
    if (window.electronAPI) {
      window.electronAPI.getApiKeys().then((keys) => {
        // Determine provider from available keys
        let provider: "anthropic" | "openai" | "openrouter" | "mock" | null = null;
        let apiKey = "";
        
        if (keys.anthropic) {
          provider = "anthropic";
          apiKey = keys.anthropic;
        } else if (keys.openai) {
          provider = "openai";
          apiKey = keys.openai;
        } else if (keys.openrouter) {
          provider = "openrouter";
          apiKey = keys.openrouter;
        }
        
        if (provider) {
          setSettings((prev) => ({
            ...prev,
            llmProvider: {
              provider,
              apiKey,
              validated: true,
            },
          }));
        }
      }).catch(() => {
        // Ignore errors
      });
    }
    
    setHasChanges(false);
    setConnectionStatus("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load tool restrictions from config
  useEffect(() => {
    const loadToolRestrictions = async () => {
      if (!gatewayClient?.isConnected()) return;
      
      setIsLoadingTools(true);
      try {
        const response = await gatewayClient.request("config.get", {});
        
        if (response.ok && response.result) {
          const config = (response.result as { config: any }).config;
          const securityConfig = config?.security;
          const toolsConfig = securityConfig?.tools;
          
          if (toolsConfig) {
            const profile = toolsConfig.profile || "full";
            const enabledTools = new Set<string>();
            
            // If profile is "full", all tools are enabled
            if (profile === "full") {
              enabledTools.add("terminal");
              enabledTools.add("browser");
              enabledTools.add("cron");
              enabledTools.add("device");
              enabledTools.add("filesystem");
              enabledTools.add("canvas");
            } else if (toolsConfig.allow) {
              // If there's an allow list, use it
              toolsConfig.allow.forEach((tool: string) => {
                if (!tool.startsWith("group:")) {
                  enabledTools.add(tool);
                }
              });
            }
            
            setToolRestrictions({ profile, enabledTools });
          }
        }
      } catch (error) {
        console.error("Failed to load tool restrictions:", error);
      } finally {
        setIsLoadingTools(false);
      }
    };

    if (gatewayClient?.isConnected()) {
      loadToolRestrictions();
    }
  }, [gatewayClient]);

  // Check gateway status when settings change
  useEffect(() => {
    if (window.electronAPI && activeTab === "gateway") {
      checkServerStatus(settings.gateway.host, settings.gateway.port);
      // Start polling when on gateway tab
      startPolling(settings.gateway.host, settings.gateway.port, 5000);
    } else {
      // Stop polling when leaving gateway tab
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [settings.gateway.host, settings.gateway.port, activeTab, checkServerStatus, startPolling, stopPolling]);

  const handleSave = async () => {
    localStorage.setItem("zuckerman:settings", JSON.stringify(settings));
    
    // Apply gateway config changes if provided
    if (onGatewayConfigChange && hasChanges) {
      onGatewayConfigChange(settings.gateway.host, settings.gateway.port);
    }

    // Save API keys if LLM provider is configured
    if (window.electronAPI && settings.llmProvider.provider && settings.llmProvider.provider !== "mock" && settings.llmProvider.apiKey) {
      const keys: { anthropic?: string; openai?: string; openrouter?: string } = {};
      if (settings.llmProvider.provider === "anthropic") {
        keys.anthropic = settings.llmProvider.apiKey;
      } else if (settings.llmProvider.provider === "openai") {
        keys.openai = settings.llmProvider.apiKey;
      } else if (settings.llmProvider.provider === "openrouter") {
        keys.openrouter = settings.llmProvider.apiKey;
      }
      
      await window.electronAPI.saveApiKeys(keys);
    }

    setHasChanges(false);
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    try {
      const testClient = new GatewayClient({
        host: settings.gateway.host,
        port: settings.gateway.port,
      });
      
      await Promise.race([
        testClient.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Connection timeout")), 5000)
        ),
      ]) as Promise<void>;
      
      testClient.disconnect();
      setConnectionStatus("success");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    } catch (error) {
      setConnectionStatus("error");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    }
  };

  const updateSettings = <K extends keyof SettingsState>(
    section: K,
    updates: Partial<SettingsState[K]>
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
    setHasChanges(true);
  };

  const validateApiKey = (key: string, provider: string): boolean => {
    if (provider === "anthropic") {
      return key.startsWith("sk-ant-");
    } else if (provider === "openai") {
      return key.startsWith("sk-");
    } else if (provider === "openrouter") {
      return key.startsWith("sk-or-");
    }
    return false;
  };

  const testApiKey = async () => {
    if (!settings.llmProvider.provider || !settings.llmProvider.apiKey) return;

    if (settings.llmProvider.provider === "mock") {
      updateSettings("llmProvider", { validated: true });
      return;
    }

    if (!validateApiKey(settings.llmProvider.apiKey, settings.llmProvider.provider)) {
      updateSettings("llmProvider", {
        validated: false,
        error: "Invalid API key format",
      });
      return;
    }

    setTestingApiKey(true);
    updateSettings("llmProvider", { error: undefined });

    try {
      // In a real implementation, you'd test the API key via gateway
      // For now, we'll just validate format
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      updateSettings("llmProvider", {
        validated: true,
        error: undefined,
      });
    } catch (error: any) {
      updateSettings("llmProvider", {
        validated: false,
        error: error.message || "API key validation failed",
      });
    } finally {
      setTestingApiKey(false);
    }
  };

  const handleProviderChange = (provider: "anthropic" | "openai" | "openrouter" | "mock") => {
    updateSettings("llmProvider", {
      provider,
      apiKey: "",
      validated: false,
      error: undefined,
    });
  };

  const handleReset = async () => {
    if (!window.electronAPI) {
      console.error("Electron API not available");
      return;
    }

    setIsResetting(true);
    try {
      // First, delete all sessions via gateway API if connected
      // This clears sessions from gateway server's memory
      if (gatewayClient?.isConnected()) {
        try {
          const sessionsResponse = await gatewayClient.request("sessions.list");
          if (sessionsResponse.ok && sessionsResponse.result) {
            const sessions = (sessionsResponse.result as { sessions?: Array<{ id: string }> }).sessions || [];
            // Delete all sessions
            for (const session of sessions) {
              try {
                await gatewayClient.request("sessions.delete", { id: session.id });
              } catch (err) {
                console.warn(`Failed to delete session ${session.id}:`, err);
              }
            }
          }
        } catch (err) {
          console.warn("Failed to delete sessions via gateway:", err);
        }
      }

      // Clear all localStorage cache (includes active sessions, settings, onboarding flag, etc.)
      clearStorageByPrefix("zuckerman:");
      
      // Explicitly clear onboarding completed flag to trigger onboarding after reset
      localStorage.removeItem("zuckerman:onboarding:completed");
      localStorage.removeItem("zuckerman:onboarding");
      
      // Delete server-side data directory (.zuckerman folder in home directory)
      const result = await window.electronAPI.resetAllData();
      if (result.success) {
        // Restart gateway server to ensure it reloads with clean state
        // The gateway will recreate the default config.json with default "zuckerman" agent
        const gatewaySettings = settings.gateway;
        try {
          await stopServer(gatewaySettings.host, gatewaySettings.port);
          await new Promise((resolve) => setTimeout(resolve, 500));
          await startServer(gatewaySettings.host, gatewaySettings.port);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (err) {
          console.warn("Failed to restart gateway:", err);
        }

        setShowResetDialog(false);
        // Reload the app to clear all state and show onboarding (since flag is cleared)
        window.location.reload();
      } else {
        alert(`Failed to reset data: ${result.error || "Unknown error"}`);
        setIsResetting(false);
      }
    } catch (error) {
      alert(`Error resetting data: ${error instanceof Error ? error.message : "Unknown error"}`);
      setIsResetting(false);
    }
  };

  const handleToolToggle = async (toolId: string) => {
    if (!gatewayClient?.isConnected()) {
      alert("Gateway not connected");
      return;
    }

    const newEnabledTools = new Set(toolRestrictions.enabledTools);
    if (newEnabledTools.has(toolId)) {
      newEnabledTools.delete(toolId);
    } else {
      newEnabledTools.add(toolId);
    }

    // If all tools are enabled, set profile to "full", otherwise use allow list
    const allTools = ["terminal", "browser", "cron", "device", "filesystem", "canvas"];
    const allEnabled = allTools.every((tool) => newEnabledTools.has(tool));
    
    const updates: any = {
      security: {
        tools: allEnabled
          ? { profile: "full" }
          : { profile: "full", allow: Array.from(newEnabledTools) },
      },
    };

    try {
      const response = await gatewayClient.request("config.update", { updates });

      if (response.ok) {
        setToolRestrictions({
          profile: allEnabled ? "full" : toolRestrictions.profile,
          enabledTools: newEnabledTools,
        });
      } else {
        alert(`Failed to update tool restrictions: ${response.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      alert(`Error updating tool restrictions: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleEnableAllTools = async () => {
    if (!gatewayClient?.isConnected()) {
      alert("Gateway not connected");
      return;
    }

    const allTools = ["terminal", "browser", "cron", "device", "filesystem", "canvas"];
    const updates: any = {
      security: {
        tools: { profile: "full" },
      },
    };

    try {
      const response = await gatewayClient.request("config.update", { updates });

      if (response.ok) {
        setToolRestrictions({
          profile: "full",
          enabledTools: new Set(allTools),
        });
      } else {
        alert(`Failed to enable all tools: ${response.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      alert(`Error enabling all tools: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "gateway", label: "Gateway", icon: <Server className="h-4 w-4" /> },
    { id: "llm", label: "LLM Provider", icon: <Brain className="h-4 w-4" /> },
    { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
    { id: "advanced", label: "Advanced", icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-6 py-8">
          {/* GitHub-style header */}
          <div className="mb-8 pb-6 border-b border-border">
            <div className="flex items-center gap-1 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                    ${activeTab === tab.id 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}
                  `}
                >
                  <div className="flex items-center gap-2">
                    {tab.icon}
                    {tab.label}
                  </div>
                </button>
              ))}
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeTab === "gateway" && "Turn the gateway server on or off."}
              {activeTab === "llm" && "Configure your LLM provider and API keys."}
              {activeTab === "security" && "Configure security settings and tool restrictions."}
              {activeTab === "advanced" && "Configure gateway connection settings and advanced options."}
            </p>
          </div>

          <div className="space-y-6">
            {activeTab === "gateway" && (
              <GatewayView
                gatewayClient={gatewayClient}
                settings={settings}
                connectionStatus={connectionStatus}
                onTestConnection={handleTestConnection}
                onUpdateGateway={(updates) => updateSettings("gateway", updates)}
                onToggleServer={async () => {
                  if (serverStatus?.running) {
                    await stopServer(settings.gateway.host, settings.gateway.port);
                  } else {
                    const success = await startServer(settings.gateway.host, settings.gateway.port);
                    if (success && gatewayClient) {
                      setTimeout(() => {
                        gatewayClient.connect().catch(() => {
                          // Connection will be handled by App component
                        });
                      }, 1000);
                    }
                  }
                }}
              />
            )}

            {activeTab === "llm" && (
              <LLMView
                llmProvider={settings.llmProvider}
                testingApiKey={testingApiKey}
                onProviderChange={handleProviderChange}
                onApiKeyChange={(apiKey) =>
                  updateSettings("llmProvider", {
                    apiKey,
                    validated: false,
                  })
                }
                onTestApiKey={testApiKey}
              />
            )}

            {activeTab === "security" && (
              <SecurityView
                gatewayClient={gatewayClient}
                toolRestrictions={toolRestrictions}
                isLoadingTools={isLoadingTools}
                onToolToggle={handleToolToggle}
                onEnableAllTools={handleEnableAllTools}
              />
            )}

            {activeTab === "advanced" && (
              <React.Fragment>
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Gateway Configuration</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure gateway connection settings.
                    </p>
                  </div>
                  <div className="px-6 py-4 space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="gateway-host" className="text-sm font-medium text-foreground">
                        Gateway Host
                      </Label>
                      <Input
                        id="gateway-host"
                        value={settings.gateway.host}
                        onChange={(e) =>
                          updateSettings("gateway", { host: e.target.value })
                        }
                        placeholder="127.0.0.1"
                        className="max-w-md"
                      />
                      <p className="text-sm text-muted-foreground">
                        The hostname or IP address of your Zuckerman Gateway. Default is 127.0.0.1.
                      </p>
                    </div>

                    <div className="border-t border-border pt-6 space-y-2">
                      <Label htmlFor="gateway-port" className="text-sm font-medium text-foreground">
                        Gateway Port
                      </Label>
                      <Input
                        id="gateway-port"
                        type="number"
                        value={settings.gateway.port}
                        onChange={(e) =>
                          updateSettings("gateway", {
                            port: parseInt(e.target.value) || 18789,
                          })
                        }
                        placeholder="18789"
                        min="1"
                        max="65535"
                        className="w-32"
                      />
                      <p className="text-sm text-muted-foreground">
                        The port number the gateway is listening on. Default is 18789.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Connection Settings</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure advanced connection behavior.
                    </p>
                  </div>
                  <div className="px-6 py-4 space-y-6">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="auto-reconnect"
                        checked={settings.advanced.autoReconnect}
                        onCheckedChange={(checked) =>
                          updateSettings("advanced", {
                            autoReconnect: checked === true,
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor="auto-reconnect" className="cursor-pointer text-sm font-medium text-foreground">
                          Auto-reconnect
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically attempt to reconnect to the gateway if the connection is lost.
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-border pt-6 space-y-2">
                      <Label htmlFor="reconnect-attempts" className="text-sm font-medium text-foreground">
                        Maximum reconnection attempts
                      </Label>
                      <Input
                        id="reconnect-attempts"
                        type="number"
                        value={settings.advanced.reconnectAttempts}
                        onChange={(e) =>
                          updateSettings("advanced", {
                            reconnectAttempts: parseInt(e.target.value) || 5,
                          })
                        }
                        min="1"
                        max="20"
                        className="w-24"
                      />
                      <p className="text-sm text-muted-foreground">
                        How many times the application will try to reconnect before showing an error.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-destructive/50 rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Irreversible and destructive actions.
                    </p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-foreground mb-1">Reset All Data</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          This will permanently delete all Zuckerman data including:
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside mb-4 space-y-1">
                          <li>All chat history and sessions</li>
                          <li>Agent configurations</li>
                          <li>Memory and transcripts</li>
                          <li>All other stored data</li>
                        </ul>
                        <Button
                          variant="destructive"
                          onClick={() => setShowResetDialog(true)}
                          disabled={!window.electronAPI}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Reset All Data
                        </Button>
                        {!window.electronAPI && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Reset functionality requires Electron API.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all Zuckerman data? This action cannot be undone.
              <br />
              <br />
              This will permanently delete:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All chat history and sessions</li>
                <li>Agent configurations</li>
                <li>Memory and transcripts</li>
                <li>All other stored data</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Reset All Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {hasChanges && (
        <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-end">
          <Button 
            onClick={handleSave}
            className="bg-[#0969da] hover:bg-[#0860ca] text-white"
          >
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
