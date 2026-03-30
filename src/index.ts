import { buildLineMessageEmbed } from "./discord/buildEmbed";
import { sendDiscordWebhook } from "./discord/sendWebhook";
import { fetchLineDisplayName } from "./line/fetchDisplayName";
import { parseWebhookPayload, pickMessageEvents } from "./line/parseEvents";
import { verifyLineSignature } from "./line/verifySignature";
import type { Env } from "./types";
import { log } from "./utils/logger";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function getRequestId(request: Request): string {
  return request.headers.get("cf-ray") ?? crypto.randomUUID();
}

function readDebugKey(request: Request, url: URL): string | null {
  return request.headers.get("x-debug-key") ?? url.searchParams.get("key");
}

async function handleDebugSendTest(request: Request, env: Env): Promise<Response> {
  const requestId = getRequestId(request);
  const url = new URL(request.url);

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!env.DEBUG_API_KEY) {
    log("warn", env.LOG_LEVEL, "Debug endpoint called without DEBUG_API_KEY configured", { requestId });
    return jsonResponse({ error: "Debug endpoint is disabled" }, 403);
  }

  const providedKey = readDebugKey(request, url);
  if (!providedKey || providedKey !== env.DEBUG_API_KEY) {
    log("warn", env.LOG_LEVEL, "Debug endpoint unauthorized", { requestId });
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const embed = {
    title: "Discord 連線測試",
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
    fields: [
      { name: "來源", value: "Cloudflare Worker /debug/send-test" },
      { name: "Request ID", value: requestId },
      { name: "時間", value: new Date().toISOString() },
    ],
  };

  const result = await sendDiscordWebhook(env.DISCORD_WEBHOOK_URL, embed);
  log(result.ok ? "info" : "error", env.LOG_LEVEL, "Debug Discord send result", {
    requestId,
    ok: result.ok,
    status: result.status,
    attempts: result.attempts,
    error: result.error,
  });

  return jsonResponse(
    {
      ok: result.ok,
      requestId,
      status: result.status,
      attempts: result.attempts,
      error: result.error,
    },
    result.ok ? 200 : 502,
  );
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const requestId = getRequestId(request);

  if (!env.LINE_CHANNEL_SECRET || !env.DISCORD_WEBHOOK_URL) {
    log("error", env.LOG_LEVEL, "Missing required env vars", { requestId });
    return jsonResponse({ error: "Missing required environment variables" }, 500);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  const verified = await verifyLineSignature(rawBody, env.LINE_CHANNEL_SECRET, signature);

  log("info", env.LOG_LEVEL, "Received webhook", {
    requestId,
    signatureVerified: verified,
  });

  if (!verified) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  const { payload, error } = parseWebhookPayload(rawBody);
  if (!payload || error) {
    log("warn", env.LOG_LEVEL, "Webhook payload parse failed", {
      requestId,
      error,
    });
    return jsonResponse({ error: error ?? "Invalid payload" }, 400);
  }

  const messageEvents = pickMessageEvents(payload.events ?? []);
  let successCount = 0;
  const failures: string[] = [];

  for (const event of messageEvents) {
    const displayName = await fetchLineDisplayName(event, env);
    const userId = event.source?.userId;
    const userLabel = displayName && userId ? `${displayName} (${userId})` : displayName ?? undefined;
    const embed = buildLineMessageEmbed(event, userLabel);
    const result = await sendDiscordWebhook(env.DISCORD_WEBHOOK_URL, embed);

    log(result.ok ? "info" : "error", env.LOG_LEVEL, "Discord webhook result", {
      requestId,
      ok: result.ok,
      status: result.status,
      attempts: result.attempts,
      error: result.error,
    });

    if (result.ok) {
      successCount += 1;
    } else {
      failures.push(result.error ?? `status=${result.status}`);
    }
  }

  const skippedCount = (payload.events?.length ?? 0) - messageEvents.length;
  if (skippedCount > 0) {
    log("info", env.LOG_LEVEL, "Skipped non-message events", {
      requestId,
      skippedCount,
    });
  }

  return jsonResponse({
    ok: failures.length === 0,
    requestId,
    totalEvents: payload.events?.length ?? 0,
    processedMessageEvents: messageEvents.length,
    delivered: successCount,
    failed: failures.length,
    lastError: failures.length > 0 ? failures[failures.length - 1] : undefined,
  }, failures.length > 0 ? 502 : 200);
}

async function handleDebugLineSimulate(request: Request, env: Env): Promise<Response> {
  const requestId = getRequestId(request);
  const url = new URL(request.url);

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!env.DEBUG_API_KEY) {
    return jsonResponse({ error: "Debug endpoint is disabled" }, 403);
  }

  const providedKey = readDebugKey(request, url);
  if (!providedKey || providedKey !== env.DEBUG_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const embed = buildLineMessageEmbed({
    type: "message",
    timestamp: Date.now(),
    source: {
      type: "user",
      userId: "debug-user",
    },
    message: {
      type: "text",
      id: "debug-msg-id",
      text: "LINE 模擬訊息（同 webhook embed 格式）",
    },
  });

  const result = await sendDiscordWebhook(env.DISCORD_WEBHOOK_URL, embed);
  log(result.ok ? "info" : "error", env.LOG_LEVEL, "Debug LINE simulate result", {
    requestId,
    ok: result.ok,
    status: result.status,
    attempts: result.attempts,
    error: result.error,
  });

  return jsonResponse(
    {
      ok: result.ok,
      requestId,
      status: result.status,
      attempts: result.attempts,
      error: result.error,
    },
    result.ok ? 200 : 502,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "lineoa-notification" });
    }

    if (url.pathname === "/webhook" || url.pathname === "/webhook/") {
      return handleWebhook(request, env);
    }

    if (url.pathname === "/debug/send-test") {
      return handleDebugSendTest(request, env);
    }

    if (url.pathname === "/debug/line-simulate") {
      return handleDebugLineSimulate(request, env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
