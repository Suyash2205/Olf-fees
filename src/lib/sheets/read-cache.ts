/** Short-lived in-memory cache to avoid Google Sheets read bursts (429). */
const store = new Map<string, { expires: number; data: unknown }>();

const DEFAULT_TTL_MS = 45_000;

export async function cachedSheetRead<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.data as T;
  }
  const data = await loader();
  store.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}

export function invalidateSheetCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
