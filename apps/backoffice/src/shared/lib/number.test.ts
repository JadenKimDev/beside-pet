import { describe, expect, it } from 'vitest';
import { formatCount, formatMs, formatPercent, formatUsd, ratio } from './index';

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('shows a dash for a missing value', () => {
    expect(formatCount(null)).toBe('–');
  });
});

describe('formatMs', () => {
  it('shows whole milliseconds under a second and seconds above', () => {
    expect(formatMs(842.4)).toBe('842ms');
    expect(formatMs(999.4)).toBe('999ms');
    expect(formatMs(1530)).toBe('1.53s');
    expect(formatMs(12345)).toBe('12.35s');
    expect(formatMs(null)).toBe('–');
  });
});

describe('ratio', () => {
  it('divides and guards a zero denominator', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(3, 0)).toBeNull();
  });
});

describe('formatPercent', () => {
  it('formats a 0..1 ratio as a percentage', () => {
    expect(formatPercent(0.125)).toBe('12.5%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(1)).toBe('100.0%');
    expect(formatPercent(0.33333, 2)).toBe('33.33%');
    expect(formatPercent(null)).toBe('–');
  });
});

describe('formatUsd', () => {
  it('uses cents for a dollar or more and four places below', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0.0031)).toBe('$0.0031');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(null)).toBe('–');
  });
});
