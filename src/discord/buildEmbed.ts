import type { DiscordEmbed, LineEvent } from "../types";

function formatMessage(event: LineEvent): string {
  const messageType = event.message?.type ?? "unknown";
  if (messageType === "text") {
    return event.message?.text ?? "(empty)";
  }

  const messageId = event.message?.id ? `, id=${event.message.id}` : "";
  return `非文字訊息：type=${messageType}${messageId}`;
}

function resolveUserLabel(event: LineEvent): string {
  const userId = event.source?.userId;
  if (userId) {
    return userId;
  }

  if (event.source?.type === "group" && event.source.groupId) {
    return `group:${event.source.groupId}`;
  }

  if (event.source?.type === "room" && event.source.roomId) {
    return `room:${event.source.roomId}`;
  }

  return "unknown";
}

export function buildLineMessageEmbed(event: LineEvent, userLabel?: string): DiscordEmbed {
  const message = formatMessage(event);
  const user = userLabel ?? resolveUserLabel(event);
  const eventTime = new Date(event.timestamp).toISOString();

  return {
    title: "LINE OA 新訊息",
    color: 0x00b900,
    timestamp: eventTime,
    fields: [
      { name: "使用者", value: user },
      { name: "訊息內容", value: message },
      { name: "時間", value: eventTime },
    ],
  };
}
