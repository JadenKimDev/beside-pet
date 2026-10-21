// @vitest-environment jsdom
// 대화 웹의 AdminConsole.test.tsx 에서 옮긴 것: 불러오는 중, 빈 목록, 거른 결과 없음. 목록 받기는 views 가 하고
// 이 위젯은 받은 목록(불러오기 전에는 null)을 props 로 받는다.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import { ACCOUNT_TABLE_TEXT as T } from '../model/view';
import { AccountBoard } from './AccountBoard';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const account = (over: Partial<Account> & Pick<Account, 'id'>): Account => ({
  username: `demo-${over.id}`,
  company: '예시 동물병원',
  role: 'viewer',
  status: 'active',
  expired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  sessionCount: 2,
  ...over,
});

const ACCOUNTS: Account[] = [
  account({ id: 'viewer' }),
  account({ id: 'waiting', status: 'pending', createdAt: '2026-10-02T00:00:00.000Z' }),
  account({ id: 'stopped', status: 'revoked' }),
  account({ id: 'admin', role: 'admin' }),
];

let container: HTMLDivElement;
let root: Root;
const noop = () => {};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(accounts: readonly Account[] | null) {
  act(() => root.render(<AccountBoard accounts={accounts} onChanged={noop} onError={noop} />));
}

function summaryCount(label: string): string | undefined {
  const list = container.querySelector(`[aria-label="${T.summaryLabel}"]`);
  const card = [...(list?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.startsWith(label),
  );
  return card?.textContent?.slice(label.length);
}

function typeSearch(text: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error('search input missing');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('AccountBoard', () => {
  it('shows the loading state and no table before the list arrives, then the rows and counts', () => {
    render(null);
    expect(container.textContent).toContain(T.loading);
    expect(container.querySelector('table')).toBeNull();

    render(ACCOUNTS);
    expect(container.textContent).not.toContain(T.loading);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual([
      'demo-waiting',
      'demo-viewer',
      'demo-stopped',
      'demo-admin관리자',
    ]);
    expect(container.querySelectorAll('ul li article, ul li section')).toHaveLength(4);
    expect(summaryCount('승인 대기')).toBe('1');
    expect(summaryCount('활성')).toBe('2');
    expect(summaryCount('만료됨')).toBe('0');
    expect(summaryCount('정지됨')).toBe('1');
  });

  it('shows the empty state when there are no accounts', () => {
    render([]);
    expect(container.textContent).toContain(T.empty);
    expect(container.textContent).toContain(T.emptyHint);
    expect(container.querySelector('table')).toBeNull();
  });

  it('says nothing matches when the search finds no account', () => {
    render(ACCOUNTS);
    typeSearch('없는-아이디');
    expect(container.textContent).toContain(T.noMatch);
    expect(container.querySelector('table')).toBeNull();

    typeSearch('STOPPED');
    expect(container.textContent).not.toContain(T.noMatch);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('says nothing matches when a state card filters to an empty state', () => {
    render(ACCOUNTS);
    const expired = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('만료됨'),
    );
    act(() => expired?.click());
    expect(expired?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain(T.noMatch);
  });
});
