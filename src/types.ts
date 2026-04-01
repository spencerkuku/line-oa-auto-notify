export interface Env {
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  DISCORD_WEBHOOK_URL: string;
  DEBUG_API_KEY?: string;
  LOG_LEVEL?: "debug" | "info" | "warn" | "error";
  NOTIFY_STORAGE?: KVNamespace;
  COOLDOWN_SECONDS?: string;
}

export interface LineWebhookPayload {
  destination?: string;
  events?: LineEvent[];
}

export interface LineEvent {
  type: string;
  timestamp: number;
  source?: {
    type?: "user" | "group" | "room";
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    type?: string;
    id?: string;
    text?: string;
  };
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  timestamp?: string;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
}
