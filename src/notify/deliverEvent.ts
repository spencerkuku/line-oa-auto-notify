import { buildLineMessageEmbed } from "../discord/buildEmbed";
import { sendDiscordWebhook } from "../discord/sendWebhook";
import { fetchLineDisplayName } from "../line/fetchDisplayName";
import type { Env, LineEvent } from "../types";
import { checkCooldown, createKvCooldownStore } from "./cooldownGuard";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export type DeliveryOutcome =
  | { status: "expired"; now: number }
  | { status: "suppressed"; userId: string; cooldownWarning?: string }
  | { status: "delivered"; attempts: number; httpStatus: number; cooldownWarning?: string }
  | { status: "failed"; attempts: number; httpStatus: number; error?: string; cooldownWarning?: string };

export async function deliverLineEvent(event: LineEvent, env: Env, cooldownSeconds: number): Promise<DeliveryOutcome> {
  const now = Date.now();
  if (Math.abs(now - event.timestamp) > REPLAY_WINDOW_MS) {
    return { status: "expired", now };
  }

  const userId = event.source?.userId;
  let cooldownWarning: string | undefined;

  if (userId) {
    const store = env.NOTIFY_STORAGE ? createKvCooldownStore(env.NOTIFY_STORAGE) : undefined;
    const cooldown = await checkCooldown(userId, store, cooldownSeconds);
    cooldownWarning = cooldown.warning;

    if (cooldown.suppressed) {
      return { status: "suppressed", userId, cooldownWarning };
    }
  }

  const displayName = await fetchLineDisplayName(event, env);
  const userLabel = displayName && userId ? `${displayName} (${userId})` : displayName ?? undefined;
  const embed = buildLineMessageEmbed(event, userLabel);
  const result = await sendDiscordWebhook(env.DISCORD_WEBHOOK_URL, embed);

  if (result.ok) {
    return { status: "delivered", attempts: result.attempts, httpStatus: result.status, cooldownWarning };
  }

  return {
    status: "failed",
    attempts: result.attempts,
    httpStatus: result.status,
    error: result.error,
    cooldownWarning,
  };
}
