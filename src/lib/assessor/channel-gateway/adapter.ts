// Registry de adapters de canal.
import type { Channel, ChannelAdapter } from "./types";
import { whatsappAdapter } from "./whatsapp-adapter";
import { telegramAdapter } from "./telegram-adapter";
import { dashboardAdapter } from "./dashboard-adapter";

const registry: Record<Channel, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  telegram: telegramAdapter,
  dashboard: dashboardAdapter,
};

export function getAdapter(channel: Channel): ChannelAdapter {
  const a = registry[channel];
  if (!a) throw new Error(`Adapter não registado para canal: ${channel}`);
  return a;
}

export type { ChannelAdapter } from "./types";
