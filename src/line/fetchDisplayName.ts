import type { Env, LineEvent } from "../types";

function getProfileEndpoint(event: LineEvent): string | null {
  const userId = event.source?.userId;
  if (!userId) {
    return null;
  }

  if (event.source?.type === "group" && event.source.groupId) {
    return `https://api.line.me/v2/bot/group/${event.source.groupId}/member/${userId}`;
  }

  if (event.source?.type === "room" && event.source.roomId) {
    return `https://api.line.me/v2/bot/room/${event.source.roomId}/member/${userId}`;
  }

  return `https://api.line.me/v2/bot/profile/${userId}`;
}

export async function fetchLineDisplayName(event: LineEvent, env: Env): Promise<string | null> {
  const endpoint = getProfileEndpoint(event);
  if (!endpoint || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { displayName?: string };
    if (!data.displayName || data.displayName.trim().length === 0) {
      return null;
    }

    return data.displayName;
  } catch {
    return null;
  }
}
