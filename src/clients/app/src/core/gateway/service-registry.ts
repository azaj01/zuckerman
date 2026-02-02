import type { GatewayClient } from "./client";
import { WhatsAppChannelService } from "../channels/whatsapp-channel-service";
import { TelegramChannelService } from "../channels/telegram-channel-service";
import { DiscordChannelService } from "../channels/discord-channel-service";
import { SignalChannelService } from "../channels/signal-channel-service";
import { ConversationService } from "../conversations/conversation-service";
import { MessageService } from "../messages/message-service";
import { AgentService } from "../agents/agent-service";
import { HealthService } from "../health/health-service";

/**
 * Service container - holds all services for a single gateway client
 */
export interface ServiceContainer {
  // Channel Services
  whatsappService: WhatsAppChannelService;
  telegramService: TelegramChannelService;
  discordService: DiscordChannelService;
  signalService: SignalChannelService;

  // Core Services
  conversationService: ConversationService;
  messageService: MessageService;
  agentService: AgentService;
  healthService: HealthService;
}

/**
 * Service Registry - manages service instances per gateway client
 * 
 * Ensures singleton instances per gateway client:
 * - One instance of each service per GatewayClient
 * - Lazy initialization (services created on first access)
 * - Dependency injection (MessageService gets ConversationService from same container)
 */
export class ServiceRegistry {
  private containers = new Map<GatewayClient, ServiceContainer>();

  /**
   * Get service container for a gateway client
   * Creates container if it doesn't exist (lazy initialization)
   */
  getContainer(client: GatewayClient | null): ServiceContainer | null {
    if (!client) {
      return null;
    }

    // Return existing container if available
    if (this.containers.has(client)) {
      return this.containers.get(client)!;
    }

    // Create new container with all services
    const container = this.createContainer(client);
    this.containers.set(client, container);
    return container;
  }

  /**
   * Get a specific service from the container
   * Returns null if client is null or service doesn't exist
   */
  getService<T extends keyof ServiceContainer>(
    client: GatewayClient | null,
    serviceName: T
  ): ServiceContainer[T] | null {
    const container = this.getContainer(client);
    return container ? container[serviceName] : null;
  }

  /**
   * Create a new service container for a gateway client
   * Handles dependency injection (e.g., MessageService → ConversationService)
   */
  private createContainer(client: GatewayClient): ServiceContainer {
    // Create core services first (no dependencies)
    const conversationService = new ConversationService(client);
    const agentService = new AgentService(client);
    const healthService = new HealthService(client);

    // Create MessageService with ConversationService dependency injection
    const messageService = new MessageService(client, conversationService);

    // Create channel services
    const whatsappService = new WhatsAppChannelService(client);
    const telegramService = new TelegramChannelService(client);
    const discordService = new DiscordChannelService(client);
    const signalService = new SignalChannelService(client);

    return {
      whatsappService,
      telegramService,
      discordService,
      signalService,
      conversationService,
      messageService,
      agentService,
      healthService,
    };
  }

  /**
   * Clear services for a specific gateway client
   * Useful when client disconnects or changes
   */
  clear(client: GatewayClient | null): void {
    if (client && this.containers.has(client)) {
      const container = this.containers.get(client)!;
      
      // Cleanup channel services if they have destroy methods
      if ("destroy" in container.whatsappService && typeof container.whatsappService.destroy === "function") {
        container.whatsappService.destroy();
      }
      if ("destroy" in container.telegramService && typeof container.telegramService.destroy === "function") {
        container.telegramService.destroy();
      }
      if ("destroy" in container.discordService && typeof container.discordService.destroy === "function") {
        container.discordService.destroy();
      }
      if ("destroy" in container.signalService && typeof container.signalService.destroy === "function") {
        container.signalService.destroy();
      }

      this.containers.delete(client);
    }
  }

  /**
   * Clear all services
   * Useful on app unmount or full reset
   */
  clearAll(): void {
    // Clear each container before clearing the map
    for (const client of this.containers.keys()) {
      this.clear(client);
    }
    this.containers.clear();
  }
}

// Singleton instance
export const serviceRegistry = new ServiceRegistry();
