import type { LineEvent, LineWebhookPayload } from "../types";

export function parseWebhookPayload(rawBody: string): { payload?: LineWebhookPayload; error?: string } {
  if (!rawBody || rawBody.trim().length === 0) {
    return { error: "Body is empty" };
  }

  try {
    const payload = JSON.parse(rawBody) as LineWebhookPayload;
    if (!Array.isArray(payload.events)) {
      return { error: "Invalid payload: events is missing" };
    }

    return { payload };
  } catch {
    return { error: "Body is not valid JSON" };
  }
}

export function pickTextMessageEvents(events: LineEvent[]): LineEvent[] {
  return events.filter((event) => event.type === "message" && event.message?.type === "text" && typeof event.message.text === "string");
}

export function pickMessageEvents(events: LineEvent[]): LineEvent[] {
  return events.filter((event) => event.type === "message" && typeof event.message?.type === "string");
}
