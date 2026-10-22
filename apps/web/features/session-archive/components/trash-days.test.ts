import { describe, expect, it } from 'vitest';
import { daysUntilPurge } from './trash-days';

describe('daysUntilPurge', () => {
  const now = new Date('2026-10-22T09:00:00Z');
  const later = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const DAY = 86_400_000;

  it('남은 시간을 날수로 올려 센다', () => {
    expect(daysUntilPurge(later(90 * DAY), now)).toBe(90);
    expect(daysUntilPurge(later(89 * DAY + 1), now)).toBe(90);
    expect(daysUntilPurge(later(DAY), now)).toBe(1);
    expect(daysUntilPurge(later(DAY + 60_000), now)).toBe(2);
  });

  it('하루 미만이거나 이미 지난 시각이면 0(오늘 지움)이다', () => {
    expect(daysUntilPurge(later(DAY - 1), now)).toBe(0);
    expect(daysUntilPurge(later(60_000), now)).toBe(0);
    expect(daysUntilPurge(later(-DAY), now)).toBe(0);
  });
});
