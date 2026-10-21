import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout, signOut } from './logout';

function stub(response: () => Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logout api', () => {
  it('posts to /v1/auth/logout and resolves to nothing on 204', async () => {
    const fetchMock = stub(() => new Response(null, { status: 204 }));

    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/auth/logout');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });
});

describe('signOut', () => {
  it('is done when the server clears the cookie', async () => {
    stub(() => new Response(null, { status: 204 }));
    await expect(signOut()).resolves.toBe(true);
  });

  it('is done when the login had already ended (401)', async () => {
    stub(() => Response.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }));
    await expect(signOut()).resolves.toBe(true);
  });

  it('is not done when the server fails', async () => {
    stub(() =>
      Response.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 }),
    );
    await expect(signOut()).resolves.toBe(false);
  });

  it('is not done when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(signOut()).resolves.toBe(false);
  });
});
