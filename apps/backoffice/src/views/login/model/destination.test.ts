import { describe, expect, it } from 'vitest';
import { loginDestination, safeNext } from './destination';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/conversations?days=30')).toBe('/conversations?days=30');
  });

  it('rejects other origins, protocol-relative and auth pages', () => {
    expect(safeNext('https://example.com/models')).toBeNull();
    expect(safeNext('//example.com')).toBeNull();
    expect(safeNext('/\\example.com')).toBeNull();
    expect(safeNext('models')).toBeNull();
    expect(safeNext('/login')).toBeNull();
    expect(safeNext('/forbidden')).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext('')).toBeNull();
  });
});

describe('loginDestination', () => {
  it('sends an admin to next or /models', () => {
    expect(loginDestination('admin', '/accounts')).toBe('/accounts');
    expect(loginDestination('admin', null)).toBe('/models');
    expect(loginDestination('admin', 'https://example.com')).toBe('/models');
  });

  it('sends a non-admin to /forbidden regardless of next', () => {
    expect(loginDestination('viewer', '/accounts')).toBe('/forbidden');
  });
});
