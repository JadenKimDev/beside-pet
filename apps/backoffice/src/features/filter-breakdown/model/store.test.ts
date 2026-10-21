import { afterEach, describe, expect, it } from 'vitest';
import type { ModelUsage } from '@/entities/metrics';
import { DEFAULT_FILTER } from './filter';
import { useBreakdownFilterStore } from './store';

const row: ModelUsage = {
  provider: 'example-provider',
  model: 'example-model-s',
  purpose: 'reply',
  promptVersion: 'reply-v3',
  calls: 4,
  errors: 0,
  inputTokens: 400,
  outputTokens: 90,
  p50Ms: 800,
  p95Ms: 1500,
  costUsd: 0.04,
};

afterEach(() => {
  useBreakdownFilterStore.getState().clear();
});

describe('breakdown filter store', () => {
  it('sets purpose and version and clears both', () => {
    const store = useBreakdownFilterStore;
    store.getState().setPurpose('crisis');
    store.getState().setVersion('crisis-v1');
    expect(store.getState().filter).toEqual({ purpose: 'crisis', version: 'crisis-v1' });

    store.getState().clear();
    expect(store.getState().filter).toEqual(DEFAULT_FILTER);
  });

  it('drops a version the new response does not have', () => {
    const store = useBreakdownFilterStore;
    store.getState().setVersion('reply-v1');
    store.getState().reconcile([row]);
    expect(store.getState().filter.version).toBe('all');
  });

  it('reads the filter from the address query', () => {
    useBreakdownFilterStore
      .getState()
      .syncFromSearch(new URLSearchParams('purpose=report&version=report-v2'));
    expect(useBreakdownFilterStore.getState().filter).toEqual({
      purpose: 'report',
      version: 'report-v2',
    });
  });
});
