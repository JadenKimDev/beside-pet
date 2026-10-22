// @vitest-environment jsdom
// 보관함의 상태 전환: 불러오는 중 → 실패(다시 불러오기) → 빈 보관함, 목록 → 되살리기(busy) → 토스트와 갱신.
// 서버는 가짜 fetch 로 대신한다. 값은 모두 지어낸 것이다.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount } from '@/components/ui/test-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import type { DeletedSessionItem, SessionStateView } from '@/lib/api';
import { monthDay } from '../list-dates';
import { useSessionArchiveStore } from '../session-archive.store';
import { TrashScreen } from './TrashScreen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/sessions/trash',
}));

/** 답을 손으로 풀어 주는 fetch. 부를 때마다 하나씩 기다린다. */
type Pending = { method: string; path: string; resolve: (res: Response) => void };
let pending: Pending[] = [];
const fakeFetch = vi.fn(
  (url: string, init?: RequestInit) =>
    new Promise<Response>((resolve) => {
      pending.push({ method: init?.method ?? 'GET', path: new URL(url).pathname, resolve });
    }),
);

async function answer(expected: string, status: number, body?: unknown) {
  const next = pending.shift();
  if (!next) throw new Error('no request waiting');
  expect(`${next.method} ${next.path}`).toBe(expected);
  await act(async () => {
    next.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

const DAY = 86_400_000;
const first: DeletedSessionItem = {
  sessionId: 'sess-gone-1',
  startedAt: '2026-10-03T12:00:00Z',
  deletedAt: '2026-10-20T09:00:00Z',
  purgeAt: new Date(Date.now() + 88 * DAY + 3_600_000).toISOString(),
  petName: '콩이',
  preferredLanguage: 'ko',
};
const second: DeletedSessionItem = {
  ...first,
  sessionId: 'sess-gone-2',
  purgeAt: new Date(Date.now() + 3_600_000).toISOString(),
};
const restored: SessionStateView = {
  sessionId: 'sess-gone-1',
  task: 2,
  progress: 0.25,
  supportLevel: 1,
  closed: true,
  reportAvailable: false,
};

let mounted: Mounted | undefined;
beforeEach(() => {
  pending = [];
  vi.stubGlobal('fetch', fakeFetch);
  useSessionArchiveStore.setState({ trash: undefined, trashStatus: 'idle', busy: false });
});
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function render() {
  mounted = mount(
    <I18nProvider initialLocale="ko">
      <TrashScreen />
    </I18nProvider>,
  );
  return mounted.container;
}

const toastText = (role: 'status' | 'alert') =>
  Array.from(document.querySelectorAll(`[role="${role}"]`), (node) => node.textContent).join('|');

const buttonsNamed = (root: ParentNode, name: string) =>
  Array.from(root.querySelectorAll('button')).filter((b) => b.textContent === name);

describe('TrashScreen 상태', () => {
  it('불러오는 중 → 실패 → 다시 불러오기 → 빈 보관함', async () => {
    const container = render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    await answer('GET /v1/sessions/deleted', 503, { message: 'down' });
    expect(container.textContent).toContain(ko.sessionTrash.failedTitle);
    expect(container.textContent).toContain(ko.sessionTrash.failedBody);
    const [reload] = buttonsNamed(container, ko.common.reload);
    expect(reload).toBeDefined();

    if (reload) click(reload);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await answer('GET /v1/sessions/deleted', 200, []);
    expect(container.textContent).toContain(ko.sessionTrash.emptyTitle);
    expect(container.textContent).toContain(ko.sessionTrash.emptyBody);
    expect(container.querySelector('a[href="/sessions"]')).not.toBeNull();
  });

  it('지운 날짜와 남은 날수를 보이고, 되살리는 동안 그 버튼이 busy 이며 끝나면 토스트와 함께 빠진다', async () => {
    const container = render();
    await answer('GET /v1/sessions/deleted', 200, [first, second]);

    const cards = container.querySelectorAll('[data-trash-session]');
    expect(cards).toHaveLength(2);
    const one = container.querySelector('[data-trash-session="sess-gone-1"]');
    const two = container.querySelector('[data-trash-session="sess-gone-2"]');
    expect(one?.textContent).toContain(ko.sessionTrash.deletedOn(monthDay(first.deletedAt, 'ko')));
    expect(one?.textContent).toContain(ko.sessionTrash.daysLeft(89));
    expect(two?.textContent).toContain(ko.sessionTrash.lastDay);

    const [restore] = one ? buttonsNamed(one, ko.sessionTrash.restore) : [];
    const [other] = two ? buttonsNamed(two, ko.sessionTrash.restore) : [];
    expect(restore).toBeDefined();
    if (restore) click(restore);
    expect(restore?.getAttribute('aria-busy')).toBe('true');
    expect(other?.disabled).toBe(true);

    await answer('POST /v1/sessions/sess-gone-1/restore', 200, restored);
    await answer('GET /v1/sessions/deleted', 200, [second]);
    expect(container.querySelectorAll('[data-trash-session]')).toHaveLength(1);
    expect(toastText('status')).toContain(ko.toast.restored);
    const [again] = buttonsNamed(container, ko.sessionTrash.restore);
    expect(again?.disabled).toBe(false);
    expect(again?.getAttribute('aria-busy')).toBeNull();
  });

  it('되살리기에 실패하면 오류 토스트가 머물고 카드는 그대로다', async () => {
    const container = render();
    await answer('GET /v1/sessions/deleted', 200, [first]);
    const [restore] = buttonsNamed(container, ko.sessionTrash.restore);
    if (restore) click(restore);
    await answer('POST /v1/sessions/sess-gone-1/restore', 500, { message: 'boom' });
    expect(toastText('alert')).toContain(ko.toast.restoreFailed);
    expect(container.querySelectorAll('[data-trash-session]')).toHaveLength(1);
    expect(restore?.getAttribute('aria-busy')).toBeNull();
  });
});
