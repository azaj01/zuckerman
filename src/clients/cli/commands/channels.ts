import { Command } from "commander";
import { WhatsAppChannel } from "@server/world/communication/messengers/channels/whatsapp.js";
import { loadConfig, saveConfig } from "@server/world/config/index.js";
import { outputJson, shouldOutputJson } from "../utils/json-output.js";
// qrcode-terminal is CommonJS, needs special handling in ESM
import qrcodeTerminal from "qrcode-terminal";

export function createChannelsCommand(): Command {
  const cmd = new Command("channels")
    .description("Manage messaging channels");

  cmd
    .command("login")
    .description("Login/pair a messaging channel (e.g., WhatsApp)")
    .option("-c, --channel <channel>", "Channel to login (whatsapp, telegram, etc.)", "whatsapp")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const channel = options.channel.toLowerCase();

      if (channel === "whatsapp") {
        await loginWhatsApp(options);
      } else if (channel === "discord") {
        await loginDiscord(options);
      } else if (channel === "signal") {
        await loginSignal(options);
      } else {
        const error = `Channel "${channel}" is not yet supported`;
        if (shouldOutputJson(options)) {
          outputJson({ error }, options);
        } else {
          console.error(error);
        }
        process.exit(1);
      }
    });

  // WhatsApp security subcommands
  const whatsappCmd = new Command("whatsapp")
    .description("Manage WhatsApp security settings");

  whatsappCmd
    .command("policy")
    .description("Set WhatsApp DM policy (open, pairing, allowlist)")
    .argument("<policy>", "Policy: open, pairing, or allowlist")
    .action(async (policy: string) => {
      const validPolicies = ["open", "pairing", "allowlist"];
      if (!validPolicies.includes(policy.toLowerCase())) {
        console.error(`Invalid policy. Must be one of: ${validPolicies.join(", ")}`);
        process.exit(1);
      }

      const config = await loadConfig();
      if (!config.channels) {
        config.channels = {};
      }
      if (!config.channels.whatsapp) {
        config.channels.whatsapp = {
          enabled: false,
          dmPolicy: "pairing",
          allowFrom: [],
        };
      }

      config.channels.whatsapp.dmPolicy = policy.toLowerCase() as "open" | "pairing" | "allowlist";
      await saveConfig(config);
      console.log(`\n✅ WhatsApp DM policy set to: ${policy}\n`);
    });

  const allowlistCmd = new Command("allowlist")
    .description("Manage WhatsApp allowlist");

  allowlistCmd
    .command("add")
    .description("Add phone number to allowlist")
    .argument("<phone>", "Phone number (e.g., +1234567890)")
    .action(async (phone: string) => {
      const config = await loadConfig();
      if (!config.channels) {
        config.channels = {};
      }
      if (!config.channels.whatsapp) {
        config.channels.whatsapp = {
          enabled: false,
          dmPolicy: "allowlist",
          allowFrom: [],
        };
      }

      const normalizedPhone = phone.replace(/[^0-9+]/g, "");
      const allowFrom = config.channels.whatsapp.allowFrom || [];

      if (allowFrom.includes(normalizedPhone)) {
        console.log(`\n⚠️  Phone number ${normalizedPhone} is already in allowlist\n`);
        return;
      }

      config.channels.whatsapp.allowFrom = [...allowFrom, normalizedPhone];
      config.channels.whatsapp.dmPolicy = "allowlist"; // Auto-set policy to allowlist
      await saveConfig(config);
      console.log(`\n✅ Added ${normalizedPhone} to WhatsApp allowlist\n`);
    });

  allowlistCmd
    .command("remove")
    .description("Remove phone number from allowlist")
    .argument("<phone>", "Phone number to remove")
    .action(async (phone: string) => {
      const config = await loadConfig();
      if (!config.channels?.whatsapp?.allowFrom) {
        console.log("\n⚠️  Allowlist is empty\n");
        return;
      }

      const normalizedPhone = phone.replace(/[^0-9+]/g, "");
      const allowFrom = config.channels.whatsapp.allowFrom || [];

      if (!allowFrom.includes(normalizedPhone)) {
        console.log(`\n⚠️  Phone number ${normalizedPhone} is not in allowlist\n`);
        return;
      }

      config.channels.whatsapp.allowFrom = allowFrom.filter((p) => p !== normalizedPhone);
      await saveConfig(config);
      console.log(`\n✅ Removed ${normalizedPhone} from WhatsApp allowlist\n`);
    });

  allowlistCmd
    .command("list")
    .description("List all phone numbers in allowlist")
    .action(async () => {
      const config = await loadConfig();
      const allowFrom = config.channels?.whatsapp?.allowFrom || [];

      if (allowFrom.length === 0) {
        console.log("\n📋 WhatsApp allowlist is empty\n");
        return;
      }

      console.log("\n📋 WhatsApp Allowlist:\n");
      allowFrom.forEach((phone, index) => {
        console.log(`  ${index + 1}. ${phone}`);
      });
      console.log();
    });

  whatsappCmd.addCommand(allowlistCmd);
  cmd.addCommand(whatsappCmd);

  cmd
    .command("status")
    .description("Show status of all configured channels")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      const config = await loadConfig();
      
      const status = {
        whatsapp: {
          enabled: config.channels?.whatsapp?.enabled || false,
          dmPolicy: config.channels?.whatsapp?.dmPolicy || "pairing",
        },
        telegram: {
          enabled: config.channels?.telegram?.enabled || false,
        },
        discord: {
          enabled: config.channels?.discord?.enabled || false,
        },
        slack: {
          enabled: config.channels?.slack?.enabled || false,
        },
        signal: {
          enabled: config.channels?.signal?.enabled || false,
        },
        imessage: {
          enabled: config.channels?.imessage?.enabled || false,
        },
      };

      if (shouldOutputJson(options)) {
        outputJson(status, options);
        return;
      }

      console.log("\n📱 Channel Status:\n");

      if (config.channels?.whatsapp) {
        const wa = config.channels.whatsapp;
        console.log(`WhatsApp: ${wa.enabled ? "✅ Enabled" : "❌ Disabled"}`);
        if (wa.enabled) {
          console.log(`  DM Policy: ${wa.dmPolicy || "pairing"}`);
          console.log(`  Allowed From: ${wa.allowFrom?.length || 0} contacts`);
        }
      }

      if (config.channels?.telegram) {
        const tg = config.channels.telegram;
        console.log(`Telegram: ${tg.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.discord) {
        const dc = config.channels.discord;
        console.log(`Discord: ${dc.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.slack) {
        const sl = config.channels.slack;
        console.log(`Slack: ${sl.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.signal) {
        const sig = config.channels.signal;
        console.log(`Signal: ${sig.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.imessage) {
        const im = config.channels.imessage;
        console.log(`iMessage: ${im.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      console.log();
    });

  return cmd;
}

async function loginWhatsApp(options: { json?: boolean } = {}): Promise<void> {
  const isJson = shouldOutputJson(options);

  if (!isJson) {
    console.log("\n📱 WhatsApp Login\n");
    console.log("This will start WhatsApp Web pairing.");
    console.log("Scan the QR code that appears with your WhatsApp app.\n");
  }

  const config = await loadConfig();

  // Ensure WhatsApp config exists
  if (!config.channels) {
    config.channels = {};
  }
  if (!config.channels.whatsapp) {
    config.channels.whatsapp = {
      enabled: false,
      dmPolicy: "pairing",
      allowFrom: [],
    };
  }

  // Temporarily enable for login
  const originalEnabled = config.channels.whatsapp.enabled;
  config.channels.whatsapp.enabled = true;

  const channel = new WhatsAppChannel(
    config.channels.whatsapp,
    (status) => {
      // Handle QR code
      const { status: connectionStatus, qr } = status;
      
      // Handle QR code clearing (empty string or null means cleared)
      if (!qr || qr.length === 0) {
        if (isJson) {
          outputJson({ event: "qr_cleared" }, options);
        }
      } else {
        // QR code is available
        if (isJson) {
          outputJson({ event: "qr_code", qr }, options);
        } else {
          console.log("\n✅ QR Code generated! Scan it with WhatsApp.\n");
          // Print QR code to terminal
          const qrModule = qrcodeTerminal as any;
          if (qrModule.default?.generate) {
            qrModule.default.generate(qr, { small: true });
          } else if (qrModule.generate) {
            qrModule.generate(qr, { small: true });
          } else {
            console.log("QR Code:", qr);
          }
          console.log("\n");
        }
      }
      
      // Handle connection status
      if (isJson) {
        outputJson({ event: "connection_status", status: connectionStatus }, options);
      } else {
        if (connectionStatus === "connected") {
          console.log("[WhatsApp] Connection status: Connected");
        } else if (connectionStatus === "disconnected") {
          console.log("[WhatsApp] Connection status: Disconnected");
        } else if (connectionStatus === "connecting") {
          console.log("[WhatsApp] Connection status: Connecting...");
        } else if (connectionStatus === "waiting_for_scan") {
          console.log("[WhatsApp] Waiting for QR code scan...");
        }
      }
    }
  );

  try {
    await channel.start();

    if (!isJson) {
      // Wait for connection
      console.log("Waiting for connection...");
      console.log("(Press Ctrl+C to cancel)\n");
    }

    // Poll for connection status
    const checkInterval = setInterval(() => {
      if (channel.isConnected()) {
        clearInterval(checkInterval);
        
        // Save config with enabled flag
        config.channels!.whatsapp!.enabled = true;
        saveConfig(config).then(() => {
          if (isJson) {
            outputJson({ 
              event: "connected", 
              success: true,
              message: "WhatsApp connected successfully" 
            }, options);
          } else {
            console.log("\n✅ WhatsApp connected successfully!\n");
            console.log("WhatsApp is now enabled in your config.");
            console.log("You can add contacts to 'allowFrom' in .zuckerman/config.json\n");
          }
          process.exit(0);
        }).catch((err) => {
          const errorMsg = `Failed to save config: ${err}`;
          if (isJson) {
            outputJson({ event: "error", error: errorMsg }, options);
          } else {
            console.error(errorMsg);
          }
          process.exit(1);
        });
      }
    }, 1000);

    // Handle Ctrl+C
    process.on("SIGINT", async () => {
      clearInterval(checkInterval);
      await channel.stop();
      config.channels!.whatsapp!.enabled = originalEnabled;
      await saveConfig(config);
      if (isJson) {
        outputJson({ event: "cancelled" }, options);
      } else {
        console.log("\n\nLogin cancelled.");
      }
      process.exit(0);
    });
  } catch (error) {
    const errorMsg = `Failed to start WhatsApp: ${error}`;
    config.channels!.whatsapp!.enabled = originalEnabled;
    await saveConfig(config);
    if (isJson) {
      outputJson({ event: "error", error: errorMsg }, options);
    } else {
      console.error("\n❌", errorMsg);
    }
    process.exit(1);
  }
}

async function loginDiscord(options: { json?: boolean } = {}): Promise<void> {
  const isJson = shouldOutputJson(options);
  console.log("\n💬 Discord Login\n");
  console.log("This will configure Discord bot connection.");
  console.log("You need a Discord bot token from https://discord.com/developers/applications\n");

  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    const token = await question("Enter your Discord bot token: ");

    if (!token.trim()) {
      console.error("\n❌ Bot token is required\n");
      rl.close();
      process.exit(1);
    }

    const config = await loadConfig();

    // Ensure Discord config exists
    if (!config.channels) {
      config.channels = {};
    }
    if (!config.channels.discord) {
      config.channels.discord = {
        enabled: false,
        token: "",
        dm: {
          enabled: true,
          policy: "pairing",
          allowFrom: [],
        },
      };
    }

    // Update config with token
    config.channels.discord.token = token.trim();
    config.channels.discord.enabled = true;

    await saveConfig(config);

    console.log("\n✅ Discord bot token saved!");
    console.log("Discord is now enabled in your config.");
    console.log("Start the gateway server to connect the bot.\n");
    rl.close();
  } catch (error) {
    console.error("\n❌ Failed to configure Discord:", error);
    rl.close();
    process.exit(1);
  }
}

async function loginSignal(options: { json?: boolean } = {}): Promise<void> {
  const isJson = shouldOutputJson(options);
  console.log("\n📱 Signal Login\n");
  console.log("Signal integration requires signal-cli to be installed and configured.");
  console.log("For more information, visit: https://github.com/AsamK/signal-cli\n");

  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    const proceed = await question("Do you have signal-cli installed and configured? (yes/no): ");

    if (proceed.toLowerCase() !== "yes" && proceed.toLowerCase() !== "y") {
      console.log("\n⚠️  Please install and configure signal-cli first.");
      console.log("Visit https://github.com/AsamK/signal-cli for installation instructions.\n");
      rl.close();
      process.exit(0);
    }

    const config = await loadConfig();

    // Ensure Signal config exists
    if (!config.channels) {
      config.channels = {};
    }
    if (!config.channels.signal) {
      config.channels.signal = {
        enabled: false,
        dmPolicy: "pairing",
        allowFrom: [],
      };
    }

    // Enable Signal
    config.channels.signal.enabled = true;

    await saveConfig(config);

    console.log("\n✅ Signal is now enabled in your config.");
    console.log("Note: Full Signal integration requires signal-cli setup.");
    console.log("Start the gateway server to connect Signal.\n");
    rl.close();
  } catch (error) {
    console.error("\n❌ Failed to configure Signal:", error);
    rl.close();
    process.exit(1);
  }
}
