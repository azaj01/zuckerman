import type { ChannelRegistry } from "@server/world/communication/messengers/channels/index.js";

// Global channel registry accessor
let globalChannelRegistry: ChannelRegistry | null = null;

export function setChannelRegistry(registry: ChannelRegistry | null): void {
  globalChannelRegistry = registry;
}

export function getChannelRegistry(): ChannelRegistry | null {
  return globalChannelRegistry;
}
