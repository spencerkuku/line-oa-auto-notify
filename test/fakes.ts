export function createInMemoryKvNamespace(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      const expiresAt = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
  } as unknown as KVNamespace;
}

export async function signLinePayload(secret: string, rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
