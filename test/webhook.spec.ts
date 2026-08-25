import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import { createInMemoryKvNamespace, signLinePayload } from "./fakes";

const CHANNEL_SECRET = "test-channel-secret";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/123456789/test-token";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    LINE_CHANNEL_SECRET: CHANNEL_SECRET,
    DISCORD_WEBHOOK_URL,
    ...overrides,
  };
}

function textMessagePayload(overrides: { timestamp?: number; userId?: string; text?: string } = {}) {
  return JSON.stringify({
    destination: "xxxxxxxxxx",
    events: [
      {
        type: "message",
        timestamp: overrides.timestamp ?? Date.now(),
        source: { type: "user", userId: overrides.userId ?? "U1234567890abcdef" },
        message: { id: "1234567890123", type: "text", text: overrides.text ?? "測試通知 from LINE OA" },
      },
    ],
  });
}

async function postWebhook(rawBody: string, env: Env, signature?: string) {
  const sig = signature ?? (await signLinePayload(env.LINE_CHANNEL_SECRET, rawBody));
  const request = new Request("https://worker.example/webhook", {
    method: "POST",
    headers: { "x-line-signature": sig },
    body: rawBody,
  });
  return worker.fetch(request, env);
}

describe("POST /webhook", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(DISCORD_WEBHOOK_URL)) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://api.line.me/")) {
        return new Response(JSON.stringify({ displayName: "測試用戶" }), { status: 200 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("forwards a valid signed webhook with a text message to Discord", async () => {
    const env = baseEnv();
    const response = await postWebhook(textMessagePayload(), env);
    const body = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(200);
    expect(body.delivered).toBe(1);
    expect(body.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches the LINE display name when an access token is configured", async () => {
    const env = baseEnv({ LINE_CHANNEL_ACCESS_TOKEN: "test-access-token" });
    const response = await postWebhook(textMessagePayload(), env);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const profileCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith("https://api.line.me/"));
    expect(profileCall).toBeTruthy();
  });

  it("suppresses a second notification for the same user within the cooldown window", async () => {
    const env = baseEnv({ NOTIFY_STORAGE: createInMemoryKvNamespace(), COOLDOWN_SECONDS: "120" });

    const first = await postWebhook(textMessagePayload({ userId: "U-cooldown" }), env);
    expect((await first.json<Record<string, unknown>>()).delivered).toBe(1);

    const second = await postWebhook(textMessagePayload({ userId: "U-cooldown" }), env);
    const secondBody = await second.json<Record<string, unknown>>();

    expect(secondBody.suppressedByCooldown).toBe(1);
    expect(secondBody.delivered).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("delivers again once the cooldown window has elapsed", async () => {
    vi.useFakeTimers();
    const env = baseEnv({ NOTIFY_STORAGE: createInMemoryKvNamespace(), COOLDOWN_SECONDS: "120" });

    await postWebhook(textMessagePayload({ userId: "U-elapsed", timestamp: Date.now() }), env);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(121_000);

    await postWebhook(textMessagePayload({ userId: "U-elapsed", timestamp: Date.now() }), env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips an event outside the replay window without forwarding it", async () => {
    const env = baseEnv();
    const staleTimestamp = Date.now() - 10 * 60 * 1000;
    const response = await postWebhook(textMessagePayload({ timestamp: staleTimestamp }), env);
    const body = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(200);
    expect(body.skippedExpiredEvents).toBe(1);
    expect(body.delivered).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a Discord send failure and returns 502", async () => {
    fetchMock.mockImplementation(async () => new Response("bad request", { status: 400 }));
    const env = baseEnv();

    const response = await postWebhook(textMessagePayload(), env);
    const body = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(502);
    expect(body.failed).toBe(1);
    expect(body.lastError).toBeTruthy();
  });

  it("never suppresses when NOTIFY_STORAGE is not configured", async () => {
    const env = baseEnv();

    await postWebhook(textMessagePayload({ userId: "U-no-kv" }), env);
    await postWebhook(textMessagePayload({ userId: "U-no-kv" }), env);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a request with an invalid signature", async () => {
    const env = baseEnv();
    const response = await postWebhook(textMessagePayload(), env, "invalid-signature");

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload", async () => {
    const env = baseEnv();
    const rawBody = "not json";
    const signature = await signLinePayload(env.LINE_CHANNEL_SECRET, rawBody);
    const request = new Request("https://worker.example/webhook", {
      method: "POST",
      headers: { "x-line-signature": signature },
      body: rawBody,
    });

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(400);
  });
});
