import { describe, expect, it } from 'vitest';
import { chartModelOptions, formatTokenTick, hasUsage, shortDate, usageChartRows } from './charts';
import { dailyRow, modelsResponse } from './tests/fixtures';

describe('usageChartRows', () => {
  const response = modelsResponse({
    daily: [
      dailyRow({ date: '2026-10-14', calls: 5 }),
      dailyRow({ date: '2026-10-14', model: 'example-model-l', calls: 2 }),
      dailyRow({ date: '2026-10-16', calls: 4 }),
    ],
  });

  it('fills every UTC day of the period with zero and sums all models', () => {
    const rows = usageChartRows(response, 'all');
    expect(rows.map((row) => row.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
    expect(rows.map((row) => row.calls)).toEqual([7, 0, 4]);
  });

  it('keeps only the chosen model', () => {
    const rows = usageChartRows(response, 'example-provider / example-model-l');
    expect(rows.map((row) => row.calls)).toEqual([2, 0, 0]);
  });

  it('falls back to all models when the chosen model is not in the response', () => {
    expect(usageChartRows(response, 'gone / model').map((row) => row.calls)).toEqual([7, 0, 4]);
  });

  it('tells an all-zero period apart', () => {
    expect(hasUsage(usageChartRows(response, 'all'))).toBe(true);
    expect(hasUsage(usageChartRows(modelsResponse({}), 'all'))).toBe(false);
  });
});

describe('chart labels', () => {
  it('lists all models first, then each provider / model', () => {
    const response = modelsResponse({
      daily: [dailyRow({ model: 'b' }), dailyRow({ model: 'a' }), dailyRow({ model: 'a' })],
    });
    expect(chartModelOptions(response)).toEqual([
      { value: 'all', label: '전체 모델' },
      { value: 'example-provider / a', label: 'example-provider / a' },
      { value: 'example-provider / b', label: 'example-provider / b' },
    ]);
  });

  it('shortens dates and token ticks', () => {
    expect(shortDate('2026-10-04')).toBe('10/04');
    expect(formatTokenTick(0)).toBe('0');
    expect(formatTokenTick(9500)).toBe('9,500');
    expect(formatTokenTick(120000)).toBe('12만');
    expect(formatTokenTick(15000)).toBe('1.5만');
  });
});
