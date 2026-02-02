import {
  makeWASocket,
  ConnectionState,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type AnyMessageContent,
} from "@whiskeysockets/baileys";
import type { Channel, ChannelMessage } from "./types.js";
import type { WhatsAppConfig } from "@server/world/config/types.js";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";

const AUTH_DIR = join(homedir(), ".zuckerman", "credentials", "whatsapp");

enum ConnectionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
}

export class WhatsAppChannel implements Channel {
  id: string = "whatsapp";
  type = "whatsapp" as const;
  
  private socket: WASocket | null = null;
  private config: WhatsAppConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private qrCodeCallback?: (qr: string) => void;
  private connectionStatusCallback?: (connected: boolean) => void;
  private saveCreds: (() => Promise<void>) | null = null;
  private isRestarting = false;
  private currentQrCode: string | null = null;
  private lastConnectionState: ConnectionStatus | null = null;
  private stateUpdateDebounce: NodeJS.Timeout | null = null;
  private isConnecting = false; // Lock to prevent concurrent connect() calls
  private isStopped = false; // Flag to prevent reconnection after stop()

  constructor(
    config: WhatsAppConfig,
    qrCallback?: (qr: string) => void,
    connectionStatusCallback?: (connected: boolean) => void,
  ) {
    this.config = config;
    this.qrCodeCallback = qrCallback;
    this.connectionStatusCallback = connectionStatusCallback;
  }

  async start(): Promise<void> {
    // Prevent concurrent start calls
    if (this.isConnecting) {
      console.log("[WhatsApp] Already connecting, skipping duplicate start()");
      return;
    }

    if (this.connectionStatus === ConnectionStatus.CONNECTED) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[WhatsApp] Channel is disabled in config");
      return;
    }

    this.isStopped = false; // Reset stopped flag when starting

    try {
      await this.connect();
    } catch (error) {
      console.error("[WhatsApp] Failed to start:", error);
      this.connectionStatus = ConnectionStatus.DISCONNECTED;
      this.isConnecting = false;
      throw error;
    }
  }

  private async connect(): Promise<void> {
    // Prevent concurrent connect calls
    if (this.isConnecting) {
      console.log("[WhatsApp] Already connecting, skipping duplicate connect()");
      return;
    }

    // Don't connect if stopped or disabled
    if (this.isStopped || !this.config.enabled) {
      console.log("[WhatsApp] Cannot connect - channel stopped or disabled");
      return;
    }

    this.isConnecting = true;

    try {
      // Clean up old socket if exists - remove ALL event listeners first
      if (this.socket) {
        try {
          // Remove all event listeners before ending
          this.socket.ev.removeAllListeners("creds.update");
          this.socket.ev.removeAllListeners("connection.update");
          this.socket.ev.removeAllListeners("messages.upsert");
          await this.socket.end(undefined);
        } catch (error) {
          // Ignore errors when ending old socket
        }
        this.socket = null;
      }

      // Ensure auth directory exists
      if (!existsSync(AUTH_DIR)) {
        mkdirSync(AUTH_DIR, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      this.saveCreds = saveCreds;
      const { version } = await fetchLatestBaileysVersion();

      const logger = pino({ level: "silent" });

      this.socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        version,
        logger,
        printQRInTerminal: false,
        browser: ["Zuckerman", "CLI", "1.0"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.setupEventHandlers(saveCreds);
      this.connectionStatus = ConnectionStatus.CONNECTING;
    } finally {
      // Reset connecting flag after a short delay to allow socket to initialize
      setTimeout(() => {
        this.isConnecting = false;
      }, 1000);
    }
  }

  private setupEventHandlers(saveCreds: () => Promise<void>): void {
    if (!this.socket) return;

    // Handle credentials update - CRITICAL: must save credentials immediately
    this.socket.ev.on("creds.update", async () => {
      try {
        console.log("[WhatsApp] Credentials updated, saving...");
        await saveCreds();
        console.log("[WhatsApp] Credentials saved successfully");
      } catch (error) {
        console.error("[WhatsApp] Failed to save credentials:", error);
      }
    });

    // Handle connection updates
    this.socket.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      this.handleConnectionUpdate(update);
    });

    // Handle incoming messages
    this.socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        if (!message.key.fromMe && message.message) {
          await this.handleIncomingMessage(message);
        }
      }
    });
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    // Clear QR code on any connection state change (not just "open")
    // This ensures QR doesn't persist when connection state changes
    if (this.currentQrCode && connection !== undefined) {
      this.clearQrCode();
    }

    // Handle QR code - only show if not connected and not restarting
    if (qr) {
      // Don't show QR if already connected or restarting
      if (this.connectionStatus === ConnectionStatus.CONNECTED || this.isRestarting) {
        console.log("[WhatsApp] Ignoring QR code - already connected or restarting");
        return;
      }
      this.handleQrCode(qr);
      return;
    }

    // Handle connection state changes with debouncing
    if (connection === "open") {
      this.handleConnected();
    } else if (connection === "connecting") {
      this.handleConnecting();
    } else if (connection === "close") {
      this.handleDisconnected(lastDisconnect);
    }
  }

  private handleQrCode(qr: string): void {
    // Store current QR code
    this.currentQrCode = qr;
    
    if (this.qrCodeCallback) {
      this.qrCodeCallback(qr);
    } else {
      // Fallback: print to terminal (CLI mode)
      console.log("\n[WhatsApp] Scan this QR code with WhatsApp:");
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

  private clearQrCode(): void {
    if (this.currentQrCode) {
      this.currentQrCode = null;
      // Broadcast QR cleared event by calling callback with null
      if (this.qrCodeCallback) {
        // Call with empty string to signal clearing (factory will convert to null)
        this.qrCodeCallback("");
      }
    }
  }

  private handleConnected(): void {
    // Debounce state updates to prevent rapid toggles
    if (this.stateUpdateDebounce) {
      clearTimeout(this.stateUpdateDebounce);
    }

    this.stateUpdateDebounce = setTimeout(() => {
      // Check current status before updating
      const previousStatus = this.connectionStatus;
      
      if (previousStatus === ConnectionStatus.CONNECTED) {
        return; // Already connected
      }

      // Clear QR code when connected
      this.clearQrCode();

      // Ensure credentials are saved before marking as connected
      if (this.saveCreds) {
        this.saveCreds().catch((error) => {
          console.error("[WhatsApp] Failed to save credentials on connect:", error);
        });
      }

      console.log("[WhatsApp] Connected successfully - device should appear in WhatsApp linked devices");
      this.connectionStatus = ConnectionStatus.CONNECTED;
      this.isRestarting = false;
      
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      // Always notify connection callback (status changed from non-connected to connected)
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback(true);
      }
      this.lastConnectionState = this.connectionStatus;
    }, 300); // 300ms debounce
  }

  private handleConnecting(): void {
    if (this.connectionStatus !== ConnectionStatus.CONNECTING) {
      console.log("[WhatsApp] Connecting...");
      this.connectionStatus = ConnectionStatus.CONNECTING;
    }
  }

  private handleDisconnected(lastDisconnect?: ConnectionState["lastDisconnect"]): void {
    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

    // Handle restart required (normal after QR scan)
    // WhatsApp disconnects after QR scan to present auth credentials
    // We MUST create a new socket - the old one is useless
    if (statusCode === DisconnectReason.restartRequired) {
      console.log("[WhatsApp] Restart required after QR scan - creating new socket...");
      this.isRestarting = true;
      // Don't update connection status callback during restart - it's temporary
      // Keep the status as CONNECTING to prevent UI flicker
      this.connectionStatus = ConnectionStatus.CONNECTING; // Show as connecting, not disconnected
      // Don't notify disconnect during restart - it's temporary
      
      // Ensure credentials are saved before reconnecting
      if (this.saveCreds) {
        this.saveCreds()
          .then(() => {
            console.log("[WhatsApp] Credentials saved, reconnecting with new socket...");
            // Clean up old socket - remove event listeners first
            if (this.socket) {
              try {
                this.socket.ev.removeAllListeners("creds.update");
                this.socket.ev.removeAllListeners("connection.update");
                this.socket.ev.removeAllListeners("messages.upsert");
                this.socket.end(undefined);
              } catch {
                // Ignore errors when ending socket
              }
              this.socket = null;
            }
            
            // Wait a bit longer to ensure credentials are fully persisted
            // Check if still enabled before reconnecting
            if (!this.isStopped && this.config.enabled) {
              this.reconnectTimeout = setTimeout(() => {
                if (!this.isStopped && this.config.enabled) {
                  this.connect().catch((error) => {
                    console.error("[WhatsApp] Reconnection after restart failed:", error);
                    this.isRestarting = false;
                  });
                } else {
                  console.log("[WhatsApp] Skipping reconnect - channel stopped or disabled");
                  this.isRestarting = false;
                }
              }, 5000);
            } else {
              console.log("[WhatsApp] Skipping reconnect - channel stopped or disabled");
              this.isRestarting = false;
            }
          })
          .catch((error) => {
            console.error("[WhatsApp] Failed to save credentials before restart:", error);
            this.isRestarting = false;
          });
      } else {
        // No saveCreds function, just reconnect if still enabled
        if (this.socket) {
          try {
            this.socket.ev.removeAllListeners("creds.update");
            this.socket.ev.removeAllListeners("connection.update");
            this.socket.ev.removeAllListeners("messages.upsert");
            this.socket.end(undefined);
          } catch {
            // Ignore errors when ending socket
          }
          this.socket = null;
        }
        if (!this.isStopped && this.config.enabled) {
          this.reconnectTimeout = setTimeout(() => {
            if (!this.isStopped && this.config.enabled) {
              this.connect().catch((error) => {
                console.error("[WhatsApp] Reconnection failed:", error);
                this.isRestarting = false;
              });
            } else {
              this.isRestarting = false;
            }
          }, 5000);
        } else {
          this.isRestarting = false;
        }
      }
      return;
    }

    // Handle connection replaced (440) - another device connected
    if (statusCode === DisconnectReason.connectionReplaced) {
      console.log("[WhatsApp] Connection replaced by another device - clearing credentials and stopping");
      this.clearQrCode();
      this.connectionStatus = ConnectionStatus.DISCONNECTED;
      this.clearCredentials();
      this.isStopped = true; // Mark as stopped to prevent reconnection
      
      // Cancel any pending reconnection
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Don't reconnect automatically - user needs to scan QR again
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback(false);
      }
      this.lastConnectionState = this.connectionStatus;
      return;
    }

    // Handle logout
    if (statusCode === DisconnectReason.loggedOut) {
      console.log("[WhatsApp] Logged out, please scan QR code again");
      this.clearQrCode();
      this.connectionStatus = ConnectionStatus.DISCONNECTED;
      this.clearCredentials();
      this.isStopped = true; // Mark as stopped to prevent reconnection
      
      // Cancel any pending reconnection
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Only notify if status actually changed
      if (this.lastConnectionState !== ConnectionStatus.DISCONNECTED && this.connectionStatusCallback) {
        this.connectionStatusCallback(false);
      }
      this.lastConnectionState = this.connectionStatus;
      return;
    }

    // Handle other disconnects - only reconnect if channel is still enabled and not stopped
    if (statusCode !== DisconnectReason.connectionClosed) {
      // Don't reconnect if stopped or disabled
      if (this.isStopped || !this.config.enabled) {
        console.log("[WhatsApp] Not reconnecting - channel stopped or disabled");
        this.connectionStatus = ConnectionStatus.DISCONNECTED;
        if (this.connectionStatusCallback) {
          this.connectionStatusCallback(false);
        }
        return;
      }

      const backoffDelay = 5000;
      console.log(`[WhatsApp] Connection closed (code: ${statusCode}), reconnecting in ${backoffDelay}ms...`);
      
      // Don't immediately set to DISCONNECTED - show as CONNECTING during reconnect
      const wasConnected = this.connectionStatus === ConnectionStatus.CONNECTED;
      this.connectionStatus = ConnectionStatus.CONNECTING;
      
      // Clean up old socket before reconnecting
      if (this.socket) {
        try {
          this.socket.ev.removeAllListeners("creds.update");
          this.socket.ev.removeAllListeners("connection.update");
          this.socket.ev.removeAllListeners("messages.upsert");
          this.socket.end(undefined);
        } catch {
          // Ignore errors
        }
        this.socket = null;
      }
      
      // Only notify disconnect if we were actually connected
      if (wasConnected && this.connectionStatusCallback) {
        this.connectionStatusCallback(false);
      }
      
      // Cancel any existing reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      
      this.reconnectTimeout = setTimeout(() => {
        // Double-check before reconnecting
        if (!this.isStopped && this.config.enabled) {
          this.connect().catch((error) => {
            console.error("[WhatsApp] Reconnection failed:", error);
            this.connectionStatus = ConnectionStatus.DISCONNECTED;
            if (this.connectionStatusCallback) {
              this.connectionStatusCallback(false);
            }
          });
        } else {
          console.log("[WhatsApp] Skipping reconnect - channel stopped or disabled");
          this.connectionStatus = ConnectionStatus.DISCONNECTED;
        }
      }, backoffDelay);
    }
  }

  async stop(): Promise<void> {
    // Mark as stopped to prevent any reconnection attempts
    this.isStopped = true;
    this.isRestarting = false;

    // Cancel all timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.stateUpdateDebounce) {
      clearTimeout(this.stateUpdateDebounce);
      this.stateUpdateDebounce = null;
    }

    this.clearQrCode();

    // Remove all event listeners and close socket
    if (this.socket) {
      try {
        // Remove all listeners before ending
        this.socket.ev.removeAllListeners("creds.update");
        this.socket.ev.removeAllListeners("connection.update");
        this.socket.ev.removeAllListeners("messages.upsert");
        await this.socket.end(undefined);
      } catch (error) {
        // Ignore errors when stopping
      }
      this.socket = null;
    }

    const previousStatus = this.connectionStatus;
    this.connectionStatus = ConnectionStatus.DISCONNECTED;
    
    // Only notify if status actually changed
    if (previousStatus !== ConnectionStatus.DISCONNECTED && this.connectionStatusCallback) {
      this.connectionStatusCallback(false);
    }
    this.lastConnectionState = this.connectionStatus;
  }

  private clearCredentials(): void {
    try {
      if (existsSync(AUTH_DIR)) {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log("[WhatsApp] Credentials cache cleared");
      }
    } catch (error) {
      console.error("[WhatsApp] Failed to clear credentials cache:", error);
    }
  }

  async send(message: string, to: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("WhatsApp channel is not connected");
    }

    if (!this.socket) {
      throw new Error("WhatsApp socket is not available");
    }

    const jid = this.normalizeJid(to);

    try {
      await this.socket.sendMessage(jid, { text: message });
    } catch (error) {
      console.error(`[WhatsApp] Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private async handleIncomingMessage(message: any): Promise<void> {
    const from = message.key.remoteJid || "";
    const messageText = this.extractMessageText(message.message);
    
    if (!messageText) {
      return;
    }

    // Check allowlist if configured
    if (this.config.dmPolicy === "allowlist" && this.config.allowFrom) {
      const senderId = this.extractPhoneNumber(from);
      const isAllowed = this.config.allowFrom.includes("*") || 
                       this.config.allowFrom.some(allowed => 
                         senderId.includes(allowed.replace(/[^0-9]/g, ""))
                       );
      
      if (!isAllowed) {
        console.log(`[WhatsApp] Message from ${from} blocked (not in allowlist)`);
        return;
      }
    }

    const channelMessage: ChannelMessage = {
      id: message.key.id || `${Date.now()}`,
      channelId: this.id,
      from: from,
      content: messageText,
      timestamp: message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now(),
      metadata: {
        peerId: from,
        peerKind: from.includes("@g.us") ? "group" : "dm",
        messageId: message.key.id,
        isGroup: from.includes("@g.us"),
      },
    };

    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(channelMessage);
      } catch (error) {
        console.error("[WhatsApp] Error in message handler:", error);
      }
    }
  }

  private extractMessageText(msg: any): string | null {
    if (msg?.conversation) return msg.conversation;
    if (msg?.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg?.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg?.videoMessage?.caption) return msg.videoMessage.caption;
    return null;
  }

  private normalizeJid(jid: string): string {
    if (jid.includes("@")) {
      return jid;
    }
    if (jid.includes("-")) {
      return `${jid}@g.us`;
    }
    return `${jid.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }

  private extractPhoneNumber(jid: string): string {
    return jid.split("@")[0];
  }

  getQrCode(): string | null {
    return null;
  }

  isConnected(): boolean {
    return this.connectionStatus === ConnectionStatus.CONNECTED && this.socket !== null;
  }
}
