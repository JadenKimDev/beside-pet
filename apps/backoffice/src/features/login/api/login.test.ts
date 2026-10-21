import { afterEach, describe, expect, it, vi } from 'vitest';
import { login } from './login';

const record = {
  id: 'acc-1',
  username: 'demo-admin',
  company: '예시 동물병원',
  role: 'admin',
  status: 'active',
  expired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login api', () => {
  it('posts the username and password to /v1/auth/login', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(record));
    vi.stubGlobal('fetch', fetchMock);

    await expect(login({ username: 'demo-admin', password: 'example-pass-1' })).resolves.toEqual(
      record,
    );
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/auth/login');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ username: 'demo-admin', password: 'example-pass-1' }),
    });
  });
});
