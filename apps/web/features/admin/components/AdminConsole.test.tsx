// @vitest-environment jsdom
// 관리자 화면의 상태 전환: 불러오는 중 → 목록, 받은 목록에서 웹이 세는 집계 네 칸,
// 상태 필터와 찾기, 삭제는 확인 모달을 거친다.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount } from '@/components/ui/test-dom';
import type { Account } from '../admin.types';

const { api } = vi.hoisted(() => ({
  api: {
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    approveAccount: vi.fn(),
    revokeAccount: vi.fn(),
    softDeleteAccount: vi.fn(),
    reactivateAccount: vi.fn(),
    setAccountExpiry: vi.fn(),
  },
}));
vi.mock('../admin.api', () => api);
vi.mock('@/i18n/persist-locale', () => ({ persistLocale: async () => undefined }));

import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import { useAdminStore } from '../admin.store';
import { AdminConsole } from './AdminConsole';

const base = {
  role: 'viewer' as const,
  expired: false,
  createdAt: '2026-09-01T00:00:00.000Z',
};

// 지어낸 계정들: 승인 대기 1, 활성 3(관리자 포함), 만료됨 1, 정지됨 1, 삭제됨 1.
const ACCOUNTS: Account[] = [
  { ...base, id: 'a1', username: 'wait-one', company: '보리상회', status: 'pending' },
  { ...base, id: 'a2', username: 'live-two', company: '하늘병원', status: 'active' },
  { ...base, id: 'a3', username: 'live-three', company: '보리상회', status: 'active' },
  { ...base, id: 'a4', username: 'old-four', company: '구름센터', status: 'active', expired: true },
  { ...base, id: 'a5', username: 'stop-five', company: '하늘병원', status: 'revoked' },
  { ...base, id: 'a6', username: 'gone-six', company: '구름센터', status: 'deleted' },
  { ...base, id: 'a7', username: 'boss', company: '본부', status: 'active', role: 'admin' },
];

let mounted: Mounted | undefined;

beforeEach(() => {
  useAdminStore.setState({ accounts: [], loaded: false, busy: false, error: undefined });
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  for (const fn of Object.values(api)) fn.mockReset();
});

function render(): void {
  mounted = mount(
    <I18nProvider initialLocale="ko">
      <AdminConsole />
    </I18nProvider>,
  );
}

const count = (state: string): string | null | undefined =>
  document.querySelector(`[data-count="${state}"] [data-count-value]`)?.textContent;

const rows = (): string[] =>
  Array.from(document.querySelectorAll('table tbody tr')).map(
    (row) => row.querySelector('td')?.textContent ?? '',
  );

function button(scope: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no button ${text}`);
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('관리자 화면', () => {
  it('불러오기 전에는 불러오는 중이고, 목록이 오면 집계 네 칸을 센다', () => {
    render();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('table')).toBeNull();

    act(() => useAdminStore.setState({ accounts: ACCOUNTS, loaded: true }));

    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(count('pending')).toBe('1');
    expect(count('active')).toBe('3');
    expect(count('expired')).toBe('1');
    expect(count('revoked')).toBe('1');
    // 전체에는 삭제된 계정도 있고, 승인 대기가 맨 위다.
    expect(rows()).toHaveLength(7);
    expect(rows()[0]).toContain('wait-one');
  });

  it('비어 있으면 빈 상태를 보인다', () => {
    useAdminStore.setState({ accounts: [], loaded: true });
    render();
    expect(document.body.textContent).toContain(ko.admin.empty);
    expect(document.querySelector('table')).toBeNull();
  });

  it('상태 필터와 찾기가 표를 좁힌다', () => {
    useAdminStore.setState({ accounts: ACCOUNTS, loaded: true });
    render();
    const filter = document.querySelector<HTMLElement>(
      `[role="group"][aria-label="${ko.admin.filterLabel}"]`,
    );
    if (!filter) throw new Error('no filter');

    click(button(filter, ko.admin.statusRevoked));
    expect(rows()).toEqual([expect.stringContaining('stop-five')]);

    click(button(filter, ko.admin.statusExpired));
    expect(rows()).toEqual([expect.stringContaining('old-four')]);

    click(button(filter, ko.admin.filterAll));
    const search = document.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('no search');
    type(search, '보리');
    expect(rows()).toHaveLength(2);
    type(search, 'FIVE');
    expect(rows()).toEqual([expect.stringContaining('stop-five')]);

    type(search, '없는이름');
    expect(rows()).toHaveLength(0);
    expect(document.body.textContent).toContain(ko.admin.noMatch);
  });

  it('삭제는 확인 모달을 거친 뒤에만 부른다', async () => {
    api.softDeleteAccount.mockResolvedValue(ACCOUNTS[0]);
    api.listAccounts.mockResolvedValue(ACCOUNTS);
    useAdminStore.setState({ accounts: ACCOUNTS, loaded: true });
    render();
    const firstRow = document.querySelector('table tbody tr');
    if (!firstRow) throw new Error('no row');

    click(button(firstRow, ko.admin.delete));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(ko.admin.confirmDeleteTitle('wait-one'));
    expect(api.softDeleteAccount).not.toHaveBeenCalled();

    click(button(dialog as Element, ko.admin.cancel));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(api.softDeleteAccount).not.toHaveBeenCalled();

    click(button(firstRow, ko.admin.delete));
    click(button(document.querySelector('[role="dialog"]') as Element, ko.admin.delete));
    await flush();
    expect(api.softDeleteAccount).toHaveBeenCalledWith('a1');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
