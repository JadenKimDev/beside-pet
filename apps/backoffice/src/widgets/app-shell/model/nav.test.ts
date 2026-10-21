import { describe, expect, it } from 'vitest';
import { isCurrentNav, NAV_ITEMS } from './nav';

describe('NAV_ITEMS', () => {
  it('lists models, conversations and accounts in order', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual(['/models', '/conversations', '/accounts']);
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
