import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchViewer } from './fetchViewer';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchViewer', () => {
  it('reads GET /v1/auth/me and returns the body', async () => {
    const body = {
      id: 'acc-1',
      username: 'demo-admin',
      company: '예시 동물병원',
      role: 'admin',
      status: 'active',
      expired: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      hasProfile: false,
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json(body, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchViewer()).resolves.toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/v1/auth/me');
    expect(init).toMatchObject({ method: 'GET' });
  });
});
