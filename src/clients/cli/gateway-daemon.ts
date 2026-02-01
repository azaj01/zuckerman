#!/usr/bin/env node

import { startGatewayServer } from "@server/world/communication/gateway/server/index.js";
import { killPort } from "@shared/utils/kill-port.js";

const host = process.argv[2] || "127.0.0.1";
const port = parseInt(process.argv[3] || "18789", 10);

(async () => {
  try {
    await killPort(port);
    const server = await startGatewayServer({ port, host });
    
    // Handle shutdown signals
    process.on("SIGINT", async () => {
      await server.close("SIGINT");
      process.exit(0);
    });
    
    process.on("SIGTERM", async () => {
      await server.close("SIGTERM");
      process.exit(0);
    });
    
    // Keep process alive
    await new Promise(() => {});
  } catch (err) {
    console.error("Failed to start gateway:", err);
    process.exit(1);
  }
})();
