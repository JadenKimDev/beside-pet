import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, isTheme, resolveTheme, THEME_COOKIE, THEMES } from './config';

describe('theme config', () => {
  it('lists the three themes with hanji as the default', () => {
    expect(THEMES).toEqual(['hanji', 'night', 'ink']);
    expect(DEFAULT_THEME).toBe('hanji');
    expect(THEME_COOKIE).toBe('beside-pet.theme');
  });

  it.each([
    [undefined, 'hanji'],
    ['', 'hanji'],
    ['hanji', 'hanji'],
    ['night', 'night'],
    ['ink', 'ink'],
    ['NIGHT', 'hanji'],
    [' ink', 'hanji'],
    ['sage', 'hanji'],
    ['hanji-night', 'hanji'],
    ['dark', 'hanji'],
  ])('resolveTheme(%j) → %s', (value, expected) => {
    expect(resolveTheme(value)).toBe(expected);
  });

  it('isTheme accepts only known themes', () => {
    expect(isTheme('night')).toBe(true);
    expect(isTheme('moss')).toBe(false);
  });
});
