import { killPort } from "./kill-port.js";
import { isGatewayRunning } from "./gateway-status.js";
import { startGatewayServer, type GatewayServer } from "@server/world/communication/gateway/server/index.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let gatewayServer: GatewayServer | null = null;
let gatewayPort: number = 18789;
let gatewayHost: string = "127.0.0.1";

/**
 * Start the gateway server directly (no process spawning)
 */
export async function startGateway(host: string = "127.0.0.1", port: number = 18789): Promise<{ success: boolean; error?: string }> {
  console.log(`[Gateway] startGateway called with host=${host}, port=${port}`);
  
  // Check if already running
  const alreadyRunning = await isGatewayRunning(host, port);
  if (alreadyRunning) {
    console.log(`[Gateway] Gateway is already running on ${host}:${port}`);
    return { success: true };
  }

  // If we have a server instance but it's not running, close it first
  if (gatewayServer) {
    try {
      await gatewayServer.close("Restarting");
    } catch (err) {
      console.warn("[Gateway] Error closing existing server:", err);
    }
    gatewayServer = null;
  }

  // Kill any existing process on the port (in case something else is using it)
  try {
    await killPort(port);
  } catch (err) {
    // Ignore errors - port might not be in use
  }

  // Store config
  gatewayHost = host;
  gatewayPort = port;

  try {
    console.log(`[Gateway] Starting gateway server directly...`);
    
    // Import and start the gateway server directly - no process spawning!
    gatewayServer = await startGatewayServer({ host, port });
    console.log(`[Gateway] Gateway server started successfully on ws://${host}:${port}`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const errorCode = (err as NodeJS.ErrnoException).code;
    
    // Handle EADDRINUSE error - port is already in use
    if (errorCode === 'EADDRINUSE' || errorMessage.includes('EADDRINUSE')) {
      console.warn(`[Gateway] Port ${port} is already in use. Checking if gateway is actually running...`);
      // Wait a moment and check if gateway is actually running
      await new Promise(resolve => setTimeout(resolve, 500));
      const isRunning = await isGatewayRunning(host, port);
      if (isRunning) {
        console.log(`[Gateway] Gateway is actually running on ${host}:${port}, treating as success`);
        return { success: true };
      } else {
        console.error(`[Gateway] Port ${port} is in use but gateway is not responding. Another process may be using the port.`);
        gatewayServer = null;
        return { success: false, error: `Port ${port} is already in use by another process` };
      }
    }
    
    console.error(`[Gateway] Failed to start gateway:`, err);
    gatewayServer = null;
    return { success: false, error: `Failed to start gateway: ${errorMessage}` };
  }
}

/**
 * Stop the gateway server using CLI command
 */
export async function stopGateway(host: string = "127.0.0.1", port: number = 18789): Promise<{ success: boolean; error?: string }> {
  try {
    // Close the server instance if we have it (for locally started servers)
    if (gatewayServer) {
      try {
        await gatewayServer.close("Stopped via API");
        gatewayServer = null;
      } catch (err) {
        console.warn("[Gateway] Error closing local server instance:", err);
        gatewayServer = null;
      }
    }

    // Execute CLI command: zuckerman gateway stop --host <host> --port <port>
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectRoot = join(__dirname, "..", "..", "..", "..");
    
    // Use pnpm to run the CLI command (pnpm cli gateway stop)
    // This matches the package.json script: "cli": "tsx src/clients/cli/index.ts"
    const pnpmPath = join(projectRoot, "node_modules", ".bin", "pnpm");
    const fs = await import("node:fs");
    
    let command: string;
    let args: string[];
    
    if (fs.existsSync(pnpmPath)) {
      command = pnpmPath;
      args = ["cli", "gateway", "stop", "--host", host, "--port", String(port)];
    } else {
      // Fallback: use tsx directly
      const tsxPath = join(projectRoot, "node_modules", ".bin", "tsx");
      const cliScript = join(projectRoot, "src", "clients", "cli", "index.ts");
      if (fs.existsSync(tsxPath)) {
        command = tsxPath;
        args = [cliScript, "gateway", "stop", "--host", host, "--port", String(port)];
      } else {
        // Last resort: use npx
        command = "npx";
        args = ["-y", "tsx", join(projectRoot, "src", "clients", "cli", "index.ts"), "gateway", "stop", "--host", host, "--port", String(port)];
      }
    }
    
    console.log(`[Gateway] Executing: ${command} ${args.join(" ")}`);
    
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: projectRoot,
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", async (code) => {
        // Wait a bit and verify it's stopped
        await new Promise((resolve) => setTimeout(resolve, 500));
        const stillRunning = await isGatewayRunning(host, port);
        
        if (code === 0 && !stillRunning) {
          resolve({ success: true });
        } else if (code === 0 && stillRunning) {
          // Command succeeded but gateway still running - might be a timing issue
          // Wait a bit more and check again
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const stillRunningAfterWait = await isGatewayRunning(host, port);
          if (!stillRunningAfterWait) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: "Gateway is still running after stop command" });
          }
        } else {
          const errorMsg = stderr || stdout || `CLI command exited with code ${code}`;
          resolve({ success: false, error: `Failed to stop gateway: ${errorMsg}` });
        }
      });

      child.on("error", (err) => {
        resolve({ success: false, error: `Failed to execute CLI command: ${err.message}` });
      });
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Failed to stop gateway: ${errorMessage}` };
  }
}

/**
 * Get gateway status
 */
export async function getGatewayStatus(host: string = "127.0.0.1", port: number = 18789): Promise<{
  running: boolean;
  address?: string;
  error?: string;
}> {
  try {
    const running = await isGatewayRunning(host, port);
    return {
      running,
      address: running ? `ws://${host}:${port}` : undefined,
    };
  } catch (err) {
    return {
      running: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Get gateway logs (empty for direct import - logs go to console)
 */
export function getGatewayLogs(limit?: number): Array<{ timestamp: number; type: "stdout" | "stderr"; message: string }> {
  // With direct import, logs go directly to console
  // Return empty array or implement log capture if needed
  return [];
}

/**
 * Clear gateway logs
 */
export function clearGatewayLogs(): void {
  // No-op for direct import
}

/**
 * Cleanup on app exit
 */
export async function cleanupGateway(): Promise<void> {
  if (gatewayServer) {
    try {
      await gatewayServer.close("App shutting down");
    } catch (err) {
      console.error("[Gateway] Error during cleanup:", err);
    }
    gatewayServer = null;
  }
}
