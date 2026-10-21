import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  approveAccount,
  createAccount,
  deleteAccount,
  listAccounts,
  reactivateAccount,
  revokeAccount,
  setAccountExpiry,
  softDeleteAccount,
} from './accounts';

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

const json =
  (body: object | object[], status = 200) =>
  () =>
    Response.json(body, { status });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account api', () => {
  it('lists with GET /v1/admin/accounts', async () => {
    const list = [{ ...record, sessionCount: 3, lastActiveAt: '2026-10-20T08:00:00.000Z' }];
    const fetchMock = stub(json(list));

    await expect(listAccounts()).resolves.toEqual(list);
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/admin/accounts');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('creates with POST and the input as the body', async () => {
    const fetchMock = stub(json(record, 201));
    const input = {
      username: 'demo-viewer',
      password: 'example-pass-1',
      company: '예시 동물병원',
      role: 'viewer' as const,
      expiresAt: '2026-12-31T14:59:00.000Z',
    };

    await expect(createAccount(input)).resolves.toEqual(record);
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/admin/accounts');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it.each([
    ['approve', approveAccount],
    ['revoke', revokeAccount],
    ['soft-delete', softDeleteAccount],
    ['reactivate', reactivateAccount],
  ] as const)('posts to /{id}/%s', async (action, call) => {
    const fetchMock = stub(json(record));

    await expect(call('acc-7')).resolves.toEqual(record);
    expect(fetchMock.mock.calls[0][0]).toBe(`/v1/admin/accounts/acc-7/${action}`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('escapes the id in the path', async () => {
    const fetchMock = stub(json(record));
    await approveAccount('a/b');
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/admin/accounts/a%2Fb/approve');
  });

  it('patches the expiry with { expiresAt }, and sends {} to clear it', async () => {
    const fetchMock = stub(json(record));

    await setAccountExpiry('acc-7', '2027-01-01T00:00:00.000Z');
    await setAccountExpiry('acc-7');

    expect(fetchMock.mock.calls[0][0]).toBe('/v1/admin/accounts/acc-7/expiry');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ expiresAt: '2027-01-01T00:00:00.000Z' }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: '{}' });
  });

  it('deletes with DELETE /{id} and resolves to nothing on 204', async () => {
    const fetchMock = stub(() => new Response(null, { status: 204 }));

    await expect(deleteAccount('acc-7')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/admin/accounts/acc-7');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });
});
