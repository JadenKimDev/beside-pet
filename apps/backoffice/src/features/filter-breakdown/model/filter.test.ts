import { describe, expect, it } from 'vitest';
import type { ModelUsage } from '@/entities/metrics';
import {
  breakdownSearch,
  DEFAULT_FILTER,
  parseBreakdownSearch,
  purposeOptions,
  reconcileFilter,
  versionOptions,
} from './filter';

function row(purpose: ModelUsage['purpose'], promptVersion: string): ModelUsage {
  return {
    provider: 'example-provider',
    model: 'example-model-s',
    purpose,
    promptVersion,
    calls: 10,
    errors: 1,
    inputTokens: 1000,
    outputTokens: 200,
    p50Ms: 900,
    p95Ms: 2100,
    costUsd: 0.12,
  };
}

const rows = [row('reply', 'reply-v2'), row('reply', 'reply-v3'), row('crisis', 'crisis-v1')];

describe('breakdown search', () => {
  it('reads purpose and version from the query', () => {
    expect(parseBreakdownSearch(new URLSearchParams('purpose=crisis&version=crisis-v1'))).toEqual({
      purpose: 'crisis',
      version: 'crisis-v1',
    });
  });

  it('reads missing or unknown purposes as all', () => {
    expect(parseBreakdownSearch(new URLSearchParams(''))).toEqual(DEFAULT_FILTER);
    expect(parseBreakdownSearch(new URLSearchParams('purpose=summary'))).toEqual(DEFAULT_FILTER);
  });

  it('writes only the chosen fields', () => {
    expect(breakdownSearch(DEFAULT_FILTER)).toEqual({});
    expect(breakdownSearch({ purpose: 'report', version: 'all' })).toEqual({ purpose: 'report' });
    expect(breakdownSearch({ purpose: 'all', version: 'reply-v3' })).toEqual({
      version: 'reply-v3',
    });
  });
});

describe('reconcileFilter', () => {
  it('goes back to all versions when the chosen version is not in the response', () => {
    expect(reconcileFilter({ purpose: 'reply', version: 'reply-v1' }, rows)).toEqual({
      purpose: 'reply',
      version: 'all',
    });
  });

  it('keeps the same object when nothing changes', () => {
    const kept = { purpose: 'reply' as const, version: 'reply-v3' };
    expect(reconcileFilter(kept, rows)).toBe(kept);
    expect(reconcileFilter(DEFAULT_FILTER, [])).toBe(DEFAULT_FILTER);
  });
});

describe('options', () => {
  it('lists all and the four purposes in a fixed order', () => {
    expect(purposeOptions().map((option) => option.value)).toEqual([
      'all',
      'reply',
      'crisis',
      'report',
      'judge',
    ]);
    expect(purposeOptions()[1].label).toBe('발화 (reply)');
    expect(purposeOptions()[0].label).toBe('전체');
  });

  it('lists all and the versions of the response, newest first', () => {
    expect(versionOptions(rows).map((option) => option.value)).toEqual([
      'all',
      'reply-v3',
      'reply-v2',
      'crisis-v1',
    ]);
  });
});
