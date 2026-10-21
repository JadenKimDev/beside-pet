import { afterEach, describe, expect, it, vi } from 'vitest';
import { ISSUE_TEXT } from './form';
import { createIssueAccountStore } from './store';

const record = {
  id: 'acc-9',
  username: 'demo-viewer',
  company: '예시 동물병원',
  role: 'viewer',
  status: 'active',
  expired: false,
  createdAt: '2026-10-21T00:00:00.000Z',
};

function stub(response: () => Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function filled() {
  const store = createIssueAccountStore();
  store.getState().setField('username', 'demo-viewer');
  store.getState().setField('password', 'example-pass-1');
  store.getState().setField('company', '예시 동물병원');
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('issue account store', () => {
  it('does not send an invalid draft', async () => {
    const fetchMock = stub(() => Response.json(record, { status: 201 }));
    const store = createIssueAccountStore();

    await expect(store.getState().submit()).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState().fieldErrors.username).toBe(ISSUE_TEXT.usernameTooShort);
  });

  it('posts the draft to /v1/admin/accounts and returns the created account', async () => {
    const fetchMock = stub(() => Response.json(record, { status: 201 }));
    const store = filled();

    const pending = store.getState().submit();
    expect(store.getState().busy).toBe(true);
    await expect(pending).resolves.toEqual(record);

    expect(fetchMock.mock.calls[0][0]).toBe('/v1/admin/accounts');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        username: 'demo-viewer',
        password: 'example-pass-1',
        company: '예시 동물병원',
        role: 'viewer',
      }),
    });
    expect(store.getState()).toMatchObject({ busy: false, error: null });
  });

  it('shows the server message on 409 and keeps the draft', async () => {
    stub(() =>
      Response.json(
        { statusCode: 409, message: 'Username already exists', error: 'Conflict' },
        { status: 409 },
      ),
    );
    const store = filled();

    await expect(store.getState().submit()).resolves.toBeNull();

    expect(store.getState().error).toBe(`${ISSUE_TEXT.failedPrefix}Username already exists`);
    expect(store.getState().draft.username).toBe('demo-viewer');
    expect(store.getState().busy).toBe(false);
  });

  it('ignores a second submit while busy', async () => {
    const fetchMock = stub(() => Response.json(record, { status: 201 }));
    const store = filled();

    const first = store.getState().submit();
    await expect(store.getState().submit()).resolves.toBeNull();
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resets to an empty draft', () => {
    const store = filled();
    store.getState().reset();
    expect(store.getState().draft.username).toBe('');
    expect(store.getState().fieldErrors).toEqual({});
  });
});
