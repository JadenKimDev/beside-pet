import { describe, expect, it } from 'vitest';
import type { Viewer } from '@/entities/viewer';
import { ApiError } from '@/shared/api';
import { authErrorTarget, gateDecision, loginPath } from './gate';

const viewer = (role: Viewer['role']): Viewer => ({
  id: 'acc-1',
  username: 'demo-admin',
  company: '예시 동물병원',
  role,
  status: 'active',
  expired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  hasProfile: false,
});

describe('loginPath', () => {
  it('carries the current path and query as next', () => {
    expect(loginPath('/models?days=30')).toBe('/login?next=%2Fmodels%3Fdays%3D30');
  });

  it('drops next for the root and for the login page itself', () => {
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('/login?next=%2Fmodels')).toBe('/login');
  });
});

describe('gateDecision', () => {
  const here = '/accounts';

  it('lets an admin in', () => {
    expect(gateDecision({ viewer: viewer('admin') }, here)).toEqual({ kind: 'allow' });
  });

  it('sends a non-admin to /forbidden', () => {
    expect(gateDecision({ viewer: viewer('viewer') }, here)).toEqual({
      kind: 'redirect',
      to: '/forbidden',
    });
  });

  it('sends 401 to the login page with next', () => {
    expect(gateDecision({ error: new ApiError(401, 'Unauthorized') }, here)).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Faccounts',
    });
  });

  it('sends 403 to /forbidden', () => {
    expect(gateDecision({ error: new ApiError(403, 'Insufficient role') }, here)).toEqual({
      kind: 'redirect',
      to: '/forbidden',
    });
  });

  it('keeps other failures on the page as an error', () => {
    expect(gateDecision({ error: new ApiError(500, 'boom') }, here)).toEqual({ kind: 'error' });
    expect(gateDecision({ error: new TypeError('fetch failed') }, here)).toEqual({
      kind: 'error',
    });
  });
});

describe('authErrorTarget', () => {
  it('maps 401 and 403 and ignores the rest', () => {
    expect(authErrorTarget(new ApiError(401, 'x'), '/models')).toBe('/login?next=%2Fmodels');
    expect(authErrorTarget(new ApiError(403, 'x'), '/models')).toBe('/forbidden');
    expect(authErrorTarget(new ApiError(500, 'x'), '/models')).toBeNull();
    expect(authErrorTarget(new Error('x'), '/models')).toBeNull();
  });
});
