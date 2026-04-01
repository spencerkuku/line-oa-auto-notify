import type { DiscordEmbed, LineEvent } from "../types";

const MAX_MESSAGE_LENGTH = 1000;

function neutralizeMentions(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .replace(/<@([!&]?\d+)>/g, "<@\u200b$1>");
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function formatMessage(event: LineEvent): string {
  const messageType = event.message?.type ?? "unknown";
  if (messageType === "text") {
    const originalText = event.message?.text ?? "(empty)";
    return truncateText(neutralizeMentions(originalText), MAX_MESSAGE_LENGTH);
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
  const user = neutralizeMentions(userLabel ?? resolveUserLabel(event));
  const unixTs = Math.floor(event.timestamp / 1000);

  return {
    title: "LINE OA 新訊息",
    color: 0x00b900,
    description: message,
    fields: [
      { name: "使用者", value: user, inline: true },
      { name: "時間", value: `<t:${unixTs}:f> (<t:${unixTs}:R>)`, inline: true },
    ],
    footer: { text: `ID: ${event.message?.id ?? "N/A"}` },
  };
}
