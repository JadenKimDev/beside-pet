import { describe, expect, it } from 'vitest';
import { dateKeysBetween, lastDays, toDateKey } from './index';

describe('toDateKey', () => {
  it('takes the UTC calendar day of an ISO timestamp (server buckets days in UTC)', () => {
    expect(toDateKey('2026-10-21T02:25:32.284Z')).toBe('2026-10-21');
    expect(toDateKey('2026-10-21T23:59:59.999Z')).toBe('2026-10-21');
    expect(toDateKey('2026-10-22T08:00:00+09:00')).toBe('2026-10-21');
    expect(toDateKey('2026-10-21')).toBe('2026-10-21');
  });

  it('throws on an invalid date', () => {
    expect(() => toDateKey('not a date')).toThrow();
  });
});

describe('lastDays', () => {
  it('returns the ISO period ending now and starting the given days earlier', () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    expect(lastDays(7, now)).toEqual({
      from: '2026-10-14T12:00:00.000Z',
      to: '2026-10-21T12:00:00.000Z',
    });
  });

  it('rejects a non-positive or fractional day count', () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    expect(() => lastDays(0, now)).toThrow();
    expect(() => lastDays(1.5, now)).toThrow();
  });
});

describe('dateKeysBetween', () => {
  it('lists every UTC day from the first to the last, inclusive', () => {
    expect(dateKeysBetween('2026-10-30T10:00:00.000Z', '2026-11-02T01:00:00.000Z')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('returns one day for the same day and none when reversed', () => {
    expect(dateKeysBetween('2026-10-21', '2026-10-21')).toEqual(['2026-10-21']);
    expect(dateKeysBetween('2026-10-22', '2026-10-21')).toEqual([]);
  });
});
