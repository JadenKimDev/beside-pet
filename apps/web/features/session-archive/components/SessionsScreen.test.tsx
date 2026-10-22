// @vitest-environment jsdom
// 대화 목록의 상태 전환: 불러오는 중 → 실패(다시 불러오기, 온보딩으로 보내지 않음) → 빈 목록(온보딩으로) → 목록.
// 서버는 가짜 fetch 로 대신한다. 값은 모두 지어낸 것이다.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount } from '@/components/ui/test-dom';
import { useAuthStore } from '@/features/auth/auth.store';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import type { SessionListItem } from '@/lib/api';
import { lastActiveLabel, weekdayTime } from '../list-dates';
import { useSessionArchiveStore } from '../session-archive.store';
import { SessionsScreen } from './SessionsScreen';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/sessions',
}));

/** 답을 손으로 풀어 주는 fetch. 부를 때마다 하나씩 기다린다. */
type Pending = { url: string; resolve: (res: Response) => void };
let pending: Pending[] = [];
const fakeFetch = vi.fn(
  (url: string) =>
    new Promise<Response>((resolve) => {
      pending.push({ url, resolve });
    }),
);

async function answer(status: number, body?: unknown, path: RegExp = /\/v1\/sessions$/) {
  const next = pending.shift();
  if (!next) throw new Error('no request waiting');
  expect(next.url).toMatch(path);
  await act(async () => {
    next.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

const closed: SessionListItem = {
  sessionId: 'sess-closed-1',
  startedAt: '2026-10-12T12:12:00Z',
  closed: true,
  reachedTask: 2,
  progress: 0.25,
  petName: '보리',
  preferredLanguage: 'ko',
  reportAvailable: true,
  reportDeleted: false,
  lastMessageAt: '2026-10-12T12:54:00Z',
  durationMinutes: 42,
  messageCount: 31,
};
const ongoing: SessionListItem = {
  ...closed,
  sessionId: 'sess-open-1',
  startedAt: '2026-10-16T12:00:00Z',
  closed: false,
  reachedTask: 3,
  progress: 0.5,
  reportAvailable: false,
  lastMessageAt: '2026-10-16T13:24:00Z',
  durationMinutes: 84,
  messageCount: 12,
};
/** 메시지가 하나도 없는 세션(옛 데이터도 같은 모양이다): 마지막 시각과 시간 칸이 없다. */
const silent = (item: SessionListItem, sessionId: string): SessionListItem => {
  const { lastMessageAt: _last, durationMinutes: _minutes, ...rest } = item;
  return { ...rest, sessionId, messageCount: 0 };
};

let mounted: Mounted | undefined;
beforeEach(() => {
  pending = [];
  router.replace.mockReset();
  router.push.mockReset();
  vi.stubGlobal('fetch', fakeFetch);
  useSessionArchiveStore.setState({ items: undefined, listStatus: 'idle' });
  useAuthStore.setState({
    ready: true,
    principal: { id: 'u-1', username: '하늘', company: '지어낸 회사', role: 'viewer' },
  });
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function render() {
  mounted = mount(
    <I18nProvider initialLocale="ko">
      <SessionsScreen />
    </I18nProvider>,
  );
  return mounted.container;
}

/** 토스트(또는 같은 역할의 알림)들의 글을 이어 붙인다. 스켈레톤도 status 라 하나만 고르지 않는다. */
const toastText = (role: 'status' | 'alert') =>
  Array.from(document.querySelectorAll(`[role="${role}"]`), (node) => node.textContent).join('|');

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === name);
}

describe('SessionsScreen 상태', () => {
  it('불러오는 중 → 실패 → 다시 불러오기 → 빈 목록이면 온보딩으로', async () => {
    const container = render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    await answer(503, { message: 'down' });
    expect(container.textContent).toContain(ko.sessionList.failedTitle);
    expect(container.textContent).toContain(ko.sessionList.failedBody);
    expect(router.replace).not.toHaveBeenCalled();
    const reload = buttonNamed(container, ko.common.reload);
    expect(reload).toBeDefined();

    if (reload) click(reload);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await answer(200, []);
    expect(router.replace).toHaveBeenCalledWith('/onboarding');
  });

  it('목록이 오면 인사, 이어지는 대화 카드, 지난 대화가 보인다', async () => {
    const container = render();
    await answer(200, [ongoing, closed]);
    expect(router.replace).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(container.textContent).toContain(ko.sessionList.greeting('하늘'));
    expect(container.textContent).toContain(ko.sessionList.continueButton);
    expect(container.textContent).toContain(ko.sessionList.pastTitle);
    expect(container.textContent).toContain(ko.sessionList.reachedUntil(ko.taskLabels[2]));
    // 이어지는 대화는 카드에만 있고 지난 대화 목록에는 마친 것 하나만 있다.
    expect(container.querySelectorAll('[data-past-session]')).toHaveLength(1);
  });

  it('이어지는 대화가 없으면 새 대화 카드가 보인다', async () => {
    const container = render();
    await answer(200, [closed]);
    expect(container.textContent).toContain(ko.sessionList.noOpenTitle);
    expect(buttonNamed(container, ko.sessionList.noOpenCta)).toBeDefined();
  });

  it('값이 있으면 이어지는 대화에 마지막 시각, 지난 대화에 시간과 메시지 수가 보인다', async () => {
    const container = render();
    await answer(200, [ongoing, closed]);
    const lastActive = container.querySelector('[data-last-active]');
    expect(lastActive?.textContent).toBe(
      ko.sessionList.lastActive(lastActiveLabel(ongoing.lastMessageAt ?? '', new Date(), 'ko')),
    );
    const meta = container.querySelector('[data-past-session="sess-closed-1"] [data-past-meta]');
    expect(meta?.textContent).toBe(
      [weekdayTime(closed.startedAt, 'ko'), '보리', ko.sessionList.itemStats(42, 31)].join(' · '),
    );
  });

  it('메시지가 없으면 마지막 시각 줄과 시간·메시지 수를 생략한다', async () => {
    const container = render();
    await answer(200, [silent(ongoing, 'sess-open-0'), silent(closed, 'sess-closed-0')]);
    expect(container.querySelector('[data-last-active]')).toBeNull();
    const meta = container.querySelector('[data-past-session="sess-closed-0"] [data-past-meta]');
    expect(meta?.textContent).toBe([weekdayTime(closed.startedAt, 'ko'), '보리'].join(' · '));
  });
});

describe('SessionsScreen 지운 리포트', () => {
  const gone: SessionListItem = {
    ...closed,
    sessionId: 'sess-report-gone',
    reportAvailable: false,
    reportDeleted: true,
  };
  const report = {
    at: '2026-10-12T13:00:00Z',
    startedAt: closed.startedAt,
    petName: '보리',
    reachedTask: 2,
    progress: 0.25,
    locale: 'ko',
    sections: [{ key: 'journey', body: '지어낸 걸어온 길' }],
  };

  it('리포트 버튼은 비활성에 "지운 리포트" 툴팁이고, 더보기의 되살리기는 리포트 화면으로 간다', async () => {
    const container = render();
    await answer(200, [gone]);
    const row = container.querySelector('[data-past-session="sess-report-gone"]');
    const reportButton = Array.from(row?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === ko.sessionList.viewReport,
    );
    expect(reportButton?.getAttribute('aria-disabled')).toBe('true');
    const tip = document.getElementById(reportButton?.getAttribute('aria-describedby') ?? '');
    expect(tip?.textContent).toBe(ko.sessionList.reportDeleted);
    expect(row?.querySelector('a[href$="/report"]')).toBeNull();

    const more = row?.querySelector<HTMLButtonElement>(
      `button[aria-label="${ko.sessionList.more}"]`,
    );
    if (more) click(more);
    const restore = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
      (node) => node.textContent === ko.sessionList.restoreReport,
    );
    expect(restore).toBeDefined();
    if (restore) click(restore);

    await answer(200, report, /\/v1\/sessions\/sess-report-gone\/report\/restore$/);
    await answer(200, [{ ...gone, reportAvailable: true, reportDeleted: false }]);
    expect(router.push).toHaveBeenCalledWith(
      '/sessions/sess-report-gone/report?notice=reportRestored',
    );
  });

  it('리포트를 되살리지 못하면 오류 토스트가 머물고 이동하지 않는다', async () => {
    const container = render();
    await answer(200, [gone]);
    const more = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${ko.sessionList.more}"]`,
    );
    if (more) click(more);
    const restore = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
      (node) => node.textContent === ko.sessionList.restoreReport,
    );
    if (restore) click(restore);
    await answer(500, { message: 'boom' }, /\/report\/restore$/);
    expect(toastText('alert')).toContain(ko.toast.reportRestoreFailed);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('리포트 화면에서 지우고 오면 토스트를 보이고 주소의 표시를 지운다', async () => {
    window.history.replaceState(null, '', '/sessions?notice=reportDeleted');
    const container = render();
    await answer(200, [gone]);
    expect(toastText('status')).toContain(ko.toast.reportDeleted);
    expect(window.location.search).toBe('');
    expect(container.querySelector('a[href="/sessions/trash"]')).not.toBeNull();
  });
});

describe('lastActiveLabel', () => {
  const now = new Date(2026, 9, 17, 15, 0);
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 9, day, hour, minute).toISOString();
  const time = (iso: string, locale: 'ko' | 'en') =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  it('오늘과 어제는 상대 날짜, 그 전은 달과 일을 시각 앞에 둔다', () => {
    const rtf = (locale: 'ko' | 'en', days: number) =>
      new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
    const today = at(17, 9, 5);
    const yesterday = at(16, 22, 24);
    const older = at(12, 21, 12);
    expect(lastActiveLabel(today, now, 'ko')).toBe(`${rtf('ko', 0)} ${time(today, 'ko')}`);
    expect(lastActiveLabel(yesterday, now, 'ko')).toBe(`${rtf('ko', -1)} ${time(yesterday, 'ko')}`);
    expect(lastActiveLabel(yesterday, now, 'en')).toBe(`${rtf('en', -1)} ${time(yesterday, 'en')}`);
    expect(lastActiveLabel(older, now, 'ko')).toBe(
      new Intl.DateTimeFormat('ko', {
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(older)),
    );
  });
});
