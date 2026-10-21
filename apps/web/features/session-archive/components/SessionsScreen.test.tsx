// @vitest-environment jsdom
// 대화 목록의 상태 전환: 불러오는 중 → 실패(다시 불러오기, 온보딩으로 보내지 않음) → 빈 목록(온보딩으로) → 목록.
// 401(로그인 없음, 정지된 계정)은 실패 화면이 아니라 첫 화면(로그인)으로 보낸다.
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

async function answer(status: number, body?: unknown) {
  const next = pending.shift();
  if (!next) throw new Error('no request waiting');
  expect(next.url).toMatch(/\/v1\/sessions$/);
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

  it('401 이면(정지된 계정 등) 로그인 정보를 비우고 첫 화면으로 보낸다. 실패 화면을 보이지 않는다', async () => {
    const container = render();
    await answer(401, { message: 'Account is unavailable' });
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(useAuthStore.getState().principal).toBeUndefined();
    expect(container.textContent).not.toContain(ko.sessionList.failedTitle);
    expect(router.replace).not.toHaveBeenCalledWith('/onboarding');
  });

  it('로그인 확인이 끝났는데 로그인 정보가 없으면 첫 화면으로 보낸다', async () => {
    useAuthStore.setState({ ready: true, principal: undefined });
    render();
    expect(router.replace).toHaveBeenCalledWith('/');
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
