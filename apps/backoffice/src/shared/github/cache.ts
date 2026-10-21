/** 모듈 메모리의 60초 캐시(키별). DB 없음. 프로세스가 다시 뜨면 빈다. */

export const CACHE_TTL_MS = 60_000;

const entries = new Map<string, { expiresAt: number; value: unknown }>();

export async function cached<Value>(key: string, load: () => Promise<Value>): Promise<Value> {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as Value;
  const value = await load();
  entries.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export function clearGitHubCache(): void {
  entries.clear();
}

export const cacheKeys = {
  board: 'board',
  issue: (number: number) => `issue:${number}`,
};
