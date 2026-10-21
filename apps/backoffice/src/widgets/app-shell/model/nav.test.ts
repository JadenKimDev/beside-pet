import { describe, expect, it } from 'vitest';
import { isCurrentNav, NAV_ITEMS } from './nav';

describe('NAV_ITEMS', () => {
  it('lists models, conversations, accounts and dev notes in order', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      '/models',
      '/conversations',
      '/accounts',
      '/dev-notes',
    ]);
  });

  it('names the dev notes item', () => {
    expect(NAV_ITEMS.find((item) => item.href === '/dev-notes')?.label).toBe('개발노트');
  });
});

describe('isCurrentNav', () => {
  it('matches the path and its sub paths only', () => {
    expect(isCurrentNav('/models', '/models')).toBe(true);
    expect(isCurrentNav('/models/abc', '/models')).toBe(true);
    expect(isCurrentNav('/modelsx', '/models')).toBe(false);
    expect(isCurrentNav('/accounts', '/models')).toBe(false);
  });
});
