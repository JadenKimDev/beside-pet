import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoginStore, LOGIN_TEXT } from './login';

const record = {
  id: 'acc-1',
  username: 'demo-admin',
  company: '예시 동물병원',
  role: 'admin',
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

describe('login store', () => {
  it('does not send when a field is empty and marks the empty fields', async () => {
    const fetchMock = stub(() => Response.json(record));
    const store = createLoginStore();

    await expect(store.getState().submit()).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState().fieldErrors).toEqual({
      username: LOGIN_TEXT.usernameRequired,
      password: LOGIN_TEXT.passwordRequired,
    });
  });

  it('treats a blank username as empty', async () => {
    stub(() => Response.json(record));
    const store = createLoginStore();
    store.getState().setField('username', '   ');
    store.getState().setField('password', 'example-pass-1');

    await store.getState().submit();

    expect(store.getState().fieldErrors).toEqual({ username: LOGIN_TEXT.usernameRequired });
  });

  it('returns the account on success and is not busy afterwards', async () => {
    stub(() => Response.json(record));
    const store = createLoginStore();
    store.getState().setField('username', 'demo-admin');
    store.getState().setField('password', 'example-pass-1');

    const pending = store.getState().submit();
    expect(store.getState().busy).toBe(true);
    await expect(pending).resolves.toEqual(record);

    expect(store.getState()).toMatchObject({ busy: false, error: null, fieldErrors: {} });
  });

  it('on 401 shows the wrong-credentials message and clears only the password', async () => {
    stub(() => Response.json({ statusCode: 401, message: 'Invalid credentials' }, { status: 401 }));
    const store = createLoginStore();
    store.getState().setField('username', 'demo-admin');
    store.getState().setField('password', 'wrong-pass-1');

    await expect(store.getState().submit()).resolves.toBeNull();

    expect(store.getState()).toMatchObject({
      busy: false,
      error: LOGIN_TEXT.wrongCredentials,
      username: 'demo-admin',
      password: '',
    });
  });

  it('on other failures shows the retry message and keeps the password', async () => {
    stub(() =>
      Response.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 }),
    );
    const store = createLoginStore();
    store.getState().setField('username', 'demo-admin');
    store.getState().setField('password', 'example-pass-1');

    await store.getState().submit();

    expect(store.getState()).toMatchObject({
      error: LOGIN_TEXT.failed,
      password: 'example-pass-1',
    });
  });

  it('ignores a second submit while the first is in flight', async () => {
    const fetchMock = stub(() => Response.json(record));
    const store = createLoginStore();
    store.getState().setField('username', 'demo-admin');
    store.getState().setField('password', 'example-pass-1');

    const first = store.getState().submit();
    await expect(store.getState().submit()).resolves.toBeNull();
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the field error when the field is edited', async () => {
    stub(() => Response.json(record));
    const store = createLoginStore();
    await store.getState().submit();

    store.getState().setField('username', 'demo-admin');

    expect(store.getState().fieldErrors).toEqual({ password: LOGIN_TEXT.passwordRequired });
  });
});
