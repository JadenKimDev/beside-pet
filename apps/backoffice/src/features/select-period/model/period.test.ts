import { describe, expect, it } from 'vitest';
import {
  customRangeError,
  DEFAULT_SELECTION,
  defaultCustomRange,
  formatRange,
  PERIOD_TEXT,
  parsePeriodSearch,
  periodErrorText,
  periodQuery,
  periodSearch,
} from './period';

// 로컬 시각으로 만든 지금. 어느 시간대에서 돌아도 같은 뜻이 되게 기대값도 로컬로 만든다.
const now = new Date(2026, 9, 21, 15, 42, 7, 123);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('periodQuery', () => {
  it('sends nothing for 7d so the server default applies', () => {
    expect(periodQuery({ preset: '7d' }, now)).toEqual({});
    expect(periodQuery(DEFAULT_SELECTION, now)).toEqual({});
  });

  it('sends today from local midnight and no to', () => {
    expect(periodQuery({ preset: 'today' }, now)).toEqual({
      from: new Date(2026, 9, 21).toISOString(),
    });
  });

  it('sends 30d as now minus 30 days and no to', () => {
    expect(periodQuery({ preset: '30d' }, now)).toEqual({
      from: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
    });
  });

  it('sends a custom range from the start day 0:00 to the end of the end day (local)', () => {
    expect(periodQuery({ preset: 'custom', start: '2026-10-01', end: '2026-10-14' }, now)).toEqual({
      from: new Date(2026, 9, 1).toISOString(),
      to: new Date(new Date(2026, 9, 15).getTime() - 1).toISOString(),
    });
  });
});

describe('customRangeError', () => {
  it('accepts a valid range, one day, and exactly 90 days', () => {
    expect(customRangeError('2026-10-01', '2026-10-14')).toBeNull();
    expect(customRangeError('2026-10-14', '2026-10-14')).toBeNull();
    expect(customRangeError('2026-07-24', '2026-10-21')).toBeNull();
  });

  it('asks for both days when one is empty or unreadable', () => {
    expect(customRangeError('', '2026-10-14')).toBe(PERIOD_TEXT.missingDays);
    expect(customRangeError('2026-10-01', '')).toBe(PERIOD_TEXT.missingDays);
    expect(customRangeError('2026-13-01', '2026-10-14')).toBe(PERIOD_TEXT.missingDays);
    expect(customRangeError('10/01/2026', '2026-10-14')).toBe(PERIOD_TEXT.missingDays);
  });

  it('rejects an end before the start', () => {
    expect(customRangeError('2026-10-14', '2026-10-13')).toBe(PERIOD_TEXT.endBeforeStart);
    expect(PERIOD_TEXT.endBeforeStart).toBe('종료일이 시작일보다 앞이에요.');
  });

  it('rejects more than 90 days', () => {
    expect(customRangeError('2026-07-23', '2026-10-21')).toBe(PERIOD_TEXT.tooLong);
    expect(PERIOD_TEXT.tooLong).toBe('한 번에 90일까지 볼 수 있어요.');
  });
});

describe('defaultCustomRange', () => {
  it('is the last 7 local days ending today', () => {
    expect(defaultCustomRange(now)).toEqual({ start: '2026-10-15', end: '2026-10-21' });
  });
});

describe('period search', () => {
  const search = (text: string) => new URLSearchParams(text);

  it('reads presets', () => {
    expect(parsePeriodSearch(search('period=today'))).toEqual({ preset: 'today' });
    expect(parsePeriodSearch(search('period=30d'))).toEqual({ preset: '30d' });
    expect(parsePeriodSearch(search('period=7d'))).toEqual({ preset: '7d' });
  });

  it('reads a valid custom range', () => {
    expect(parsePeriodSearch(search('from=2026-10-01&to=2026-10-14'))).toEqual({
      preset: 'custom',
      start: '2026-10-01',
      end: '2026-10-14',
    });
  });

  it('falls back to the default for anything else', () => {
    expect(parsePeriodSearch(search(''))).toEqual(DEFAULT_SELECTION);
    expect(parsePeriodSearch(search('period=1y'))).toEqual(DEFAULT_SELECTION);
    expect(parsePeriodSearch(search('from=2026-10-14&to=2026-10-01'))).toEqual(DEFAULT_SELECTION);
    expect(parsePeriodSearch(search('from=2026-10-14'))).toEqual(DEFAULT_SELECTION);
  });

  it('writes a selection back so that it reads the same', () => {
    const selections = [
      { preset: 'today' },
      { preset: '7d' },
      { preset: '30d' },
      { preset: 'custom', start: '2026-10-01', end: '2026-10-14' },
    ] as const;
    for (const selection of selections) {
      expect(parsePeriodSearch(new URLSearchParams(periodSearch(selection)))).toEqual(selection);
    }
    expect(periodSearch({ preset: '30d' })).toEqual({ period: '30d' });
    expect(periodSearch({ preset: 'custom', start: '2026-10-01', end: '2026-10-14' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-14',
    });
  });
});

describe('periodErrorText', () => {
  it('turns the server period errors into Korean and keeps unknown ones', () => {
    expect(periodErrorText('to must not be before from')).toBe(PERIOD_TEXT.endBeforeStart);
    expect(periodErrorText('Range must be at most 90 days')).toBe(PERIOD_TEXT.tooLong);
    expect(periodErrorText('from must be a valid ISO 8601 date string')).toBe(
      PERIOD_TEXT.unreadable,
    );
    expect(periodErrorText('to must be a valid ISO 8601 date string')).toBe(PERIOD_TEXT.unreadable);
    expect(periodErrorText('property extra should not exist')).toBe(
      'property extra should not exist',
    );
  });
});

describe('formatRange', () => {
  it('shows both ends in local minutes', () => {
    const from = new Date(2026, 9, 14, 9, 0);
    const to = new Date(2026, 9, 21, 15, 42);
    expect(formatRange(from.toISOString(), to.toISOString())).toBe(
      '2026-10-14 09:00 ~ 2026-10-21 15:42',
    );
  });
});
