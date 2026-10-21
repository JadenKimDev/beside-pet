import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModerationStore, MODERATION_TEXT, type ModerationRequest } from './moderation';

const record = {
  id: 'acc-7',
  username: 'demo-viewer',
  company: '예시 동물병원',
  role: 'viewer',
  status: 'active',
  expired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

function stub(response: () => Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('moderation store', () => {
  it.each([
    [{ kind: 'approve' }, 'POST', '/v1/admin/accounts/acc-7/approve', undefined],
    [{ kind: 'revoke' }, 'POST', '/v1/admin/accounts/acc-7/revoke', undefined],
    [{ kind: 'reactivate' }, 'POST', '/v1/admin/accounts/acc-7/reactivate', undefined],
    [{ kind: 'restore' }, 'POST', '/v1/admin/accounts/acc-7/reactivate', undefined],
    [{ kind: 'softDelete' }, 'POST', '/v1/admin/accounts/acc-7/soft-delete', undefined],
    [
      { kind: 'setExpiry', expiresAt: '2027-01-01T00:00:00.000Z' },
      'PATCH',
      '/v1/admin/accounts/acc-7/expiry',
      JSON.stringify({ expiresAt: '2027-01-01T00:00:00.000Z' }),
    ],
    [{ kind: 'setExpiry' }, 'PATCH', '/v1/admin/accounts/acc-7/expiry', '{}'],
  ] as [ModerationRequest, string, string, string | undefined][])(
    'sends %o as %s %s',
    async (request, method, path, body) => {
      const fetchMock = stub(() => Response.json(record));
      const store = createModerationStore();

      await expect(store.getState().run('acc-7', request)).resolves.toEqual({
        kind: 'updated',
        account: record,
      });
      expect(fetchMock.mock.calls[0][0]).toBe(path);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method });
      if (body !== undefined) expect(fetchMock.mock.calls[0][1]?.body).toBe(body);
    },
  );

  it('purges with DELETE and reports the account as gone', async () => {
    const fetchMock = stub(() => new Response(null, { status: 204 }));
    const store = createModerationStore();

    await expect(store.getState().run('acc-7', { kind: 'purge' })).resolves.toEqual({
      kind: 'purged',
      id: 'acc-7',
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('is busy while a request runs and ignores another click', async () => {
    const fetchMock = stub(() => Response.json(record));
    const store = createModerationStore();

    const first = store.getState().run('acc-7', { kind: 'approve' });
    expect(store.getState().busy).toBe('approve');
    await expect(store.getState().run('acc-7', { kind: 'revoke' })).resolves.toBeNull();
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getState().busy).toBeNull();
  });

  it('keeps the server message with a prefix on failure', async () => {
    stub(() =>
      Response.json(
        { statusCode: 400, message: 'Account is not deleted', error: 'Bad Request' },
        { status: 400 },
      ),
    );
    const store = createModerationStore();

    await expect(store.getState().run('acc-7', { kind: 'purge' })).resolves.toBeNull();

    expect(store.getState()).toMatchObject({
      busy: null,
      error: `${MODERATION_TEXT.failedPrefix}Account is not deleted`,
    });
  });

  it('shows the retry message when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const store = createModerationStore();

    await store.getState().run('acc-7', { kind: 'approve' });

    expect(store.getState().error).toBe(MODERATION_TEXT.networkFailed);
  });

  it('clears the previous error when the next request starts', async () => {
    stub(() =>
      Response.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 }),
    );
    const store = createModerationStore();
    await store.getState().run('acc-7', { kind: 'approve' });

    stub(() => Response.json(record));
    await store.getState().run('acc-7', { kind: 'approve' });

    expect(store.getState().error).toBeNull();
  });
});
