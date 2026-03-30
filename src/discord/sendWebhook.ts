import type { DiscordEmbed } from "../types";

type SendResult = {
  ok: boolean;
  status: number;
  attempts: number;
  error?: string;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function isLikelyDiscordWebhookUrl(webhookUrl: string): boolean {
  try {
    const parsed = new URL(webhookUrl);
    const isDiscordHost =
      parsed.hostname === "discord.com" ||
      parsed.hostname === "ptb.discord.com" ||
      parsed.hostname === "canary.discord.com" ||
      parsed.hostname === "discordapp.com";
    const isWebhookPath = parsed.pathname.startsWith("/api/webhooks/");
    return isDiscordHost && isWebhookPath;
  } catch {
    return false;
  }
}

export async function sendDiscordWebhook(webhookUrl: string, embed: DiscordEmbed): Promise<SendResult> {
  if (!isLikelyDiscordWebhookUrl(webhookUrl)) {
    return {
      ok: false,
      status: 400,
      attempts: 1,
      error: "DISCORD_WEBHOOK_URL format is invalid",
    };
  }

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          embeds: [embed],
        }),
      });
    } catch (error) {
      if (attempt === maxAttempts) {
        return {
          ok: false,
          status: 0,
          attempts: attempt,
          error: error instanceof Error ? error.message : "Unknown fetch error",
        };
      }

      await sleep(150 * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        attempts: attempt,
      };
    }

    if (!isRetryable(response.status) || attempt === maxAttempts) {
      const bodyText = await response.text();
      return {
        ok: false,
        status: response.status,
        attempts: attempt,
        error: bodyText.slice(0, 500),
      };
    }

    await sleep(200 * 2 ** (attempt - 1));
  }

  return {
    ok: false,
    status: 0,
    attempts: 3,
    error: "Unexpected retry loop termination",
  };
}
