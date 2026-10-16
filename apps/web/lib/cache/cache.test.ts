import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from './cache';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCache', () => {
  it('returns a stored value until the TTL passes', () => {
    const cache = createCache<string>(1_000);
    cache.set('s1', '보리의 리포트');

    vi.advanceTimersByTime(999);
    expect(cache.get('s1')).toBe('보리의 리포트');

    vi.advanceTimersByTime(1);
    expect(cache.get('s1')).toBeUndefined();
  });

  it('returns undefined for an unknown key', () => {
    expect(createCache<number>(1_000).get('missing')).toBeUndefined();
  });

  it('restarts the TTL when a key is set again', () => {
    const cache = createCache<number>(1_000);
    cache.set('k', 1);
    vi.advanceTimersByTime(800);
    cache.set('k', 2);
    vi.advanceTimersByTime(800);

    expect(cache.get('k')).toBe(2);
  });

  it('invalidate removes one key and clear removes all', () => {
    const cache = createCache<number>(1_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.invalidate('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);

    cache.clear();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
  });
});
