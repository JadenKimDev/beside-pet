// @vitest-environment jsdom
// 확인을 거치는 동작(정지, 삭제, 완전 삭제)이 모달 없이 API 를 부르지 않는가. `AccountActions` 는 `needsConfirm` 이 아니라
// 자기 안의 표로 모달을 고르므로, 모델 테스트만으로는 이 빈틈을 막지 못한다.

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/entities/account';
import { AccountActions } from './AccountActions';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const record = {
  id: 'acc-7',
  username: 'demo-viewer',
  company: '예시 동물병원',
  role: 'viewer',
  status: 'active',
  expired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

function account(overrides: Partial<Account>): Account {
  return { ...record, role: 'viewer', status: 'active', sessionCount: 2, ...overrides };
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom 에 <dialog> 의 모달 메서드가 없으면 열림 속성만 바꾸는 것으로 대신한다.
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(record),
  );
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(row: Account) {
  const onChanged = vi.fn();
  act(() => root.render(<AccountActions account={row} onChanged={onChanged} />));
  return onChanged;
}

function button(label: string, scope: ParentNode = container): HTMLButtonElement {
  const found = [...scope.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button: ${label}`);
  return found;
}

function dialog(): HTMLDialogElement {
  const found = container.querySelector('dialog');
  if (!found) throw new Error('no dialog');
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe.each([
  ['정지', '/v1/admin/accounts/acc-7/revoke', '계정을 정지할까요?'],
  ['삭제', '/v1/admin/accounts/acc-7/soft-delete', '계정을 삭제할까요?'],
] as const)('%s', (label, path, title) => {
  it('opens the confirm dialog without calling the API, and cancel never calls it', async () => {
    render(account({}));

    await click(button(label));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
    expect(dialog().textContent).toContain(`demo-viewer ${title}`);

    await click(button('취소', dialog()));
    expect(container.querySelector('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the API once after confirming', async () => {
    const onChanged = render(account({}));

    await click(button(label));
    await click(button(label, dialog()));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(path);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(onChanged).toHaveBeenCalledWith({ kind: 'updated', account: record });
  });
});

describe('완전 삭제', () => {
  it('keeps the confirm button off until the username is typed exactly, then deletes', async () => {
    const onChanged = render(account({ status: 'deleted', deletedAt: '2026-01-01T00:00:00.000Z' }));

    await click(button('완전 삭제'));
    expect(fetchMock).not.toHaveBeenCalled();
    const confirm = button('완전 삭제', dialog());
    const input = dialog().querySelector('input');
    if (!input) throw new Error('no username input');
    expect(confirm.disabled).toBe(true);

    type(input, 'demo-viewe');
    expect(confirm.disabled).toBe(true);
    await click(confirm);
    expect(fetchMock).not.toHaveBeenCalled();

    type(input, 'demo-viewer');
    expect(confirm.disabled).toBe(false);
    await click(confirm);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/admin/accounts/acc-7');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(onChanged).toHaveBeenCalledWith({ kind: 'purged', id: 'acc-7' });
  });

  it('keeps the button off with the days left as its title within three months of suspension', async () => {
    const deletedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    render(account({ status: 'deleted', deletedAt }));

    const purge = button('완전 삭제');
    expect(purge.disabled).toBe(true);
    expect(purge.title).toMatch(/\d+/);
    await click(purge);
    expect(container.querySelector('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows when the account was suspended', () => {
    render(account({ status: 'deleted', deletedAt: '2026-01-01T00:00:00.000Z' }));
    expect(container.textContent).toContain('2026-01-01');
  });

  it('shows the server 409 through the error path', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        {
          statusCode: 409,
          message: 'Account must be suspended for 3 months before deletion',
          error: 'Conflict',
        },
        { status: 409 },
      ),
    );
    const onError = vi.fn();
    act(() =>
      root.render(
        <AccountActions
          account={account({ status: 'deleted', deletedAt: '2026-01-01T00:00:00.000Z' })}
          onChanged={vi.fn()}
          onError={onError}
        />,
      ),
    );

    await click(button('완전 삭제'));
    const input = dialog().querySelector('input');
    if (!input) throw new Error('no username input');
    type(input, 'demo-viewer');
    await click(button('완전 삭제', dialog()));

    expect(onError).toHaveBeenCalledWith(
      '처리하지 못했어요: Account must be suspended for 3 months before deletion',
    );
  });
});
