const COOLDOWN_TTL_BUFFER_SECONDS = 60;

export interface CooldownStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

export interface CooldownCheckResult {
  suppressed: boolean;
  warning?: string;
}

export function createKvCooldownStore(kv: KVNamespace): CooldownStore {
  return {
    get: (key) => kv.get(key),
    put: (key, value, options) => kv.put(key, value, options),
  };
}

export async function checkCooldown(
  userId: string,
  store: CooldownStore | undefined,
  cooldownSeconds: number,
): Promise<CooldownCheckResult> {
  if (!store) {
    return { suppressed: false };
  }

  const key = `last_notify:${userId}`;
  const nowUnix = Math.floor(Date.now() / 1000);

  try {
    const lastNotifyRaw = await store.get(key);
    if (lastNotifyRaw) {
      const lastNotifyUnix = Number.parseInt(lastNotifyRaw, 10);
      if (Number.isFinite(lastNotifyUnix) && nowUnix - lastNotifyUnix < cooldownSeconds) {
        return { suppressed: true };
      }
    }

    await store.put(key, String(nowUnix), {
      expirationTtl: cooldownSeconds + COOLDOWN_TTL_BUFFER_SECONDS,
    });
    return { suppressed: false };
  } catch (error) {
    return {
      suppressed: false,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}
