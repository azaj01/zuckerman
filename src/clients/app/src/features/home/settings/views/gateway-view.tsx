import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GatewayClient } from "../../../../core/gateway/client";
import { CheckCircle2, XCircle, Power, Loader2 } from "lucide-react";
import { GatewayLogsViewer } from "../../../../components/gateway-logs-viewer";
import type { GatewayStatus } from "../../../../hooks/use-gateway";

interface GatewayViewProps {
  gatewayClient: GatewayClient | null;
  settings: {
    gateway: {
      host: string;
      port: number;
      autoStart: boolean;
    };
  };
  connectionStatus: "idle" | "testing" | "success" | "error";
  serverStatus: GatewayStatus | null;
  isServerStarting: boolean;
  isServerStopping: boolean;
  onTestConnection: () => void;
  onUpdateGateway: (updates: Partial<{ host: string; port: number; autoStart: boolean }>) => void;
  onToggleServer: () => void;
}

export function GatewayView({
  gatewayClient,
  settings,
  connectionStatus,
  serverStatus,
  isServerStarting,
  isServerStopping,
  onTestConnection,
  onUpdateGateway,
  onToggleServer,
}: GatewayViewProps) {

  return (
    <React.Fragment>
      <div className="border border-border rounded-md bg-card">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Gateway Server</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {window.electronAPI 
              ? "Control the gateway server process."
              : "Gateway management requires Electron API."}
          </p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {serverStatus && (
                <div className="flex items-center gap-2 text-sm">
                  {serverStatus.running ? (
                    <>
                      <div className="h-2 w-2 rounded-full bg-[#3fb950]"></div>
                      <span className="text-muted-foreground">Running</span>
                    </>
                  ) : (
                    <>
                      <div className="h-2 w-2 rounded-full bg-muted-foreground"></div>
                      <span className="text-muted-foreground">Stopped</span>
                    </>
                  )}
                </div>
              )}
            </div>
            {window.electronAPI && (
              <Button
                variant={serverStatus?.running ? "destructive" : "default"}
                size="default"
                onClick={onToggleServer}
                disabled={isServerStopping || isServerStarting}
              >
                {isServerStopping ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Turning off...
                  </>
                ) : isServerStarting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Turning on...
                  </>
                ) : serverStatus?.running ? (
                  <>
                    <Power className="h-4 w-4 mr-2" />
                    Turn Off
                  </>
                ) : (
                  <>
                    <Power className="h-4 w-4 mr-2" />
                    Turn On
                  </>
                )}
              </Button>
            )}
          </div>

          {serverStatus?.error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">
              {serverStatus.error}
            </div>
          )}
        </div>
      </div>

      <div className="border border-border rounded-md bg-card">
        <div className="px-6 py-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="gateway-auto-start"
              checked={settings.gateway.autoStart}
              onCheckedChange={(checked) =>
                onUpdateGateway({
                  autoStart: checked === true,
                })
              }
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="gateway-auto-start" className="cursor-pointer text-sm font-medium text-foreground">
                Auto-start gateway on app launch
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Automatically start the gateway server when the app launches.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onTestConnection}
              disabled={connectionStatus === "testing"}
            >
              {connectionStatus === "testing" && "Testing..."}
              {connectionStatus === "idle" && "Test connection"}
              {connectionStatus === "success" && (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Connected
                </>
              )}
              {connectionStatus === "error" && (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Connection failed
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Verify that the gateway is reachable with current settings.
            </p>
          </div>
        </div>
      </div>

      {window.electronAPI && (
        <div className="border border-border rounded-md bg-card">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">Gateway Logs</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View real-time logs from the gateway server process.
            </p>
          </div>
          <div className="px-6 py-4">
            <GatewayLogsViewer limit={200} />
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
