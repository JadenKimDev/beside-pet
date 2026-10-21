import { describe, expect, it } from 'vitest';
import {
  failureRate,
  filterUsage,
  promptVersionsOf,
  purposesOf,
  sortByCalls,
  summarizeUsage,
} from './breakdown';
import { usage } from './tests/fixtures';

const rows = [
  usage({ purpose: 'reply', promptVersion: 'reply-v2', calls: 40, errors: 2, p50Ms: 1100 }),
  usage({ purpose: 'reply', promptVersion: 'reply-v1', calls: 10, errors: 0, p50Ms: 1400 }),
  usage({ purpose: 'crisis', promptVersion: 'crisis-v1', calls: 30, errors: 1, p50Ms: 300 }),
  usage({ purpose: 'report', promptVersion: 'report-v3', calls: 5, errors: 0 }),
];

describe('filterUsage', () => {
  it('keeps everything for all/all', () => {
    expect(filterUsage(rows, { purpose: 'all', version: 'all' })).toEqual(rows);
  });

  it('filters by purpose and by prompt version, together', () => {
    expect(filterUsage(rows, { purpose: 'reply', version: 'all' })).toHaveLength(2);
    expect(filterUsage(rows, { purpose: 'all', version: 'crisis-v1' })).toEqual([rows[2]]);
    expect(filterUsage(rows, { purpose: 'reply', version: 'reply-v1' })).toEqual([rows[1]]);
    expect(filterUsage(rows, { purpose: 'crisis', version: 'reply-v1' })).toEqual([]);
  });
});

describe('purposesOf / promptVersionsOf', () => {
  it('lists the purposes present, in the fixed order reply, crisis, report', () => {
    expect(purposesOf([rows[3], rows[2], rows[0]])).toEqual(['reply', 'crisis', 'report']);
    expect(purposesOf([rows[2]])).toEqual(['crisis']);
    expect(purposesOf([])).toEqual([]);
  });

  it('lists distinct prompt versions, descending', () => {
    expect(promptVersionsOf([...rows, rows[0]])).toEqual([
      'report-v3',
      'reply-v2',
      'reply-v1',
      'crisis-v1',
    ]);
  });
});

describe('summarizeUsage', () => {
  it('sums calls, errors, tokens and cost', () => {
    const summary = summarizeUsage([
      usage({ calls: 10, errors: 1, inputTokens: 100, outputTokens: 20, costUsd: 0.25 }),
      usage({ calls: 30, errors: 3, inputTokens: 300, outputTokens: 40, costUsd: 0.5 }),
    ]);
    expect(summary).toMatchObject({
      groups: 2,
      calls: 40,
      errors: 4,
      inputTokens: 400,
      outputTokens: 60,
      costUsd: 0.75,
      failureRate: 0.1,
    });
  });

  it('shows a single row percentile as is', () => {
    const summary = summarizeUsage([usage({ p50Ms: 1200, p95Ms: 3000, firstTokenP50Ms: 600 })]);
    expect(summary.p50Ms).toEqual({ min: 1200, max: 1200 });
    expect(summary.p95Ms).toEqual({ min: 3000, max: 3000 });
    expect(summary.firstTokenP50Ms).toEqual({ min: 600, max: 600 });
  });

  it('turns several rows percentiles into a min–max range instead of adding them', () => {
    const summary = summarizeUsage([
      usage({ p50Ms: 1100, p95Ms: 2300, firstTokenP50Ms: 700 }),
      usage({ p50Ms: 1500, p95Ms: 2100 }),
      usage({ p50Ms: 900, p95Ms: 4000, firstTokenP50Ms: 500 }),
    ]);
    expect(summary.p50Ms).toEqual({ min: 900, max: 1500 });
    expect(summary.p95Ms).toEqual({ min: 2100, max: 4000 });
    expect(summary.firstTokenP50Ms).toEqual({ min: 500, max: 700 });
  });

  it('has no first-token value when no row streamed, and nothing for no rows', () => {
    expect(summarizeUsage([usage({})]).firstTokenP50Ms).toBeNull();
    expect(summarizeUsage([])).toEqual({
      groups: 0,
      calls: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      failureRate: null,
      p50Ms: null,
      p95Ms: null,
      firstTokenP50Ms: null,
    });
  });
});

describe('failureRate', () => {
  it('divides errors by calls and has no value without calls', () => {
    expect(failureRate({ calls: 200, errors: 10 })).toBe(0.05);
    expect(failureRate({ calls: 0, errors: 0 })).toBeNull();
  });
});

describe('sortByCalls', () => {
  it('orders by calls descending without changing the input', () => {
    const input = [rows[3], rows[0], rows[2]];
    expect(sortByCalls(input).map((r) => r.calls)).toEqual([40, 30, 5]);
    expect(input.map((r) => r.calls)).toEqual([5, 40, 30]);
  });
});
