/**
 * lib/cache/cache.ts — generic TTL cache factory. App-agnostic.
 * Create ONE typed cache per domain inside lib/data (e.g. createCache<Profile>(...)),
 * never cache from UI/stores. A per-domain instance keeps the value fully typed —
 * no `any`/`unknown` and no shared heterogeneous map to tangle.
 */
export interface Cache<Value> {
  get(key: string): Value | undefined;
  set(key: string, value: Value): void;
  invalidate(key: string): void;
  clear(): void;
}

export function createCache<Value>(ttlMs: number): Cache<Value> {
  const store = new Map<string, { value: Value; expiresAt: number }>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    invalidate(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}
