import { describe, expect, it } from 'vitest';
import { isAdmin } from './role';
import type { Viewer } from './types';

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

describe('isAdmin', () => {
  it('is true only for the admin role', () => {
    expect(isAdmin(viewer('admin'))).toBe(true);
    expect(isAdmin(viewer('viewer'))).toBe(false);
  });
});
