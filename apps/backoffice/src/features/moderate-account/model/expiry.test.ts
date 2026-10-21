import { describe, expect, it } from 'vitest';
import { EXPIRY_QUICK_DAYS, fromLocalInput, quickExpiry, toLocalInput } from './expiry';

describe('expiry input', () => {
  it('turns ISO into a datetime-local value in local time and back', () => {
    const local = new Date(2026, 11, 31, 23, 59);
    expect(toLocalInput(local.toISOString())).toBe('2026-12-31T23:59');
    expect(fromLocalInput('2026-12-31T23:59')).toBe(local.toISOString());
  });

  it('gives an empty input for no expiry and nothing for an unreadable value', () => {
    expect(toLocalInput(undefined)).toBe('');
    expect(fromLocalInput('')).toBeUndefined();
    expect(fromLocalInput('soon')).toBeUndefined();
  });

  it('offers +30, +90 and +365 days from the later of now and the current expiry', () => {
    expect(EXPIRY_QUICK_DAYS).toEqual([30, 90, 365]);
    const now = new Date(2026, 9, 21, 12, 0);
    const later = new Date(2026, 10, 1, 12, 0);
    const day = 24 * 60 * 60 * 1000;
    expect(quickExpiry(undefined, 30, now)).toBe(
      toLocalInput(new Date(now.getTime() + 30 * day).toISOString()),
    );
    expect(quickExpiry(later.toISOString(), 90, now)).toBe(
      toLocalInput(new Date(later.getTime() + 90 * day).toISOString()),
    );
  });
});
