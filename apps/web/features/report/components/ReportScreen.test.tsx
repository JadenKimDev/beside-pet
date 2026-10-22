// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount } from '@/components/ui/test-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import type { MindReport, SessionStateView } from '@/lib/api';
import { ReportScreen } from './ReportScreen';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/sessions/s/report',
}));

// 지어낸 값이다. 실제 사용자의 대화나 리포트가 아니다.
const REPORT: MindReport = {
  at: '2026-10-12T09:00:00.000Z',
  startedAt: '2026-10-03T09:00:00.000Z',
  petName: '테스트콩',
  reachedTask: 2,
  progress: 0.25,
  locale: 'ko',
  sections: [
    { key: 'journey', body: '지어낸 걸어온 길' },
    { key: 'emotions', body: '지어낸 감정', tags: ['그리움', '고마움', '미안함'] },
    { key: 'keepsake', body: '지어낸 간직할 것' },
    { key: 'encouragement', body: '지어낸 다독임' },
  ],
};

const state = (sessionId: string, reportAvailable: boolean): SessionStateView => ({
  sessionId,
  task: 2,
  progress: 0.25,
  supportLevel: 1,
  closed: true,
  reportAvailable,
});

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Route = () => Response | Promise<Response>;

/** 경로의 끝으로 가짜 응답을 고른다. 고르지 못하면 404. */
function stubFetch(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const route = routes[path];
    return route ? route() : json(404, { message: 'Not found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  router.push.mockReset();
  vi.unstubAllGlobals();
});

function render(sessionId: string) {
  mounted = mount(
    <I18nProvider initialLocale="ko">
      <ReportScreen sessionId={sessionId} writingDelayMs={0} />
    </I18nProvider>,
  );
  return mounted.container;
}

const sectionKeys = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-section]'), (node) =>
    node.getAttribute('data-section'),
  );

describe('ReportScreen 상태 전환', () => {
  it('쓰는 중 → 네 구역, 409 → 아직 안 열림, 실패 → 다시 시도 → 네 구역', async () => {
    // 1. 리포트를 쓰는 동안은 "쓰는 중", 다 쓰면 네 구역이 순서대로 보인다.
    let finishWriting: (response: Response) => void = () => undefined;
    stubFetch({
      '/v1/sessions/s-writing': () => json(200, state('s-writing', true)),
      '/v1/sessions/s-writing/report': () =>
        new Promise<Response>((resolve) => {
          finishWriting = resolve;
        }),
    });
    let container = render('s-writing');
    await flush();
    expect(container.textContent).toContain(ko.report.writingTitle);
    expect(container.textContent).toContain(ko.report.writingHint);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(sectionKeys(container)).toEqual([]);

    await act(async () => finishWriting(json(200, REPORT)));
    await flush();
    expect(container.textContent).not.toContain(ko.report.writingTitle);
    expect(sectionKeys(container)).toEqual(['journey', 'emotions', 'keepsake', 'encouragement']);
    expect(container.textContent).toContain(ko.report.title('테스트콩'));
    expect(container.textContent).toContain(ko.report.signature);
    expect(container.textContent).toContain(ko.report.writeOnce);
    mounted?.unmount();
    vi.unstubAllGlobals();

    // 2. 서버가 아직 열지 않은 리포트(409)는 "아직 안 열림"이고 다시 시도를 두지 않는다.
    stubFetch({
      '/v1/sessions/s-locked': () => json(200, state('s-locked', false)),
      '/v1/sessions/s-locked/report': () =>
        json(409, { message: 'The report is not available for this session yet.' }),
    });
    container = render('s-locked');
    await flush();
    expect(container.textContent).toContain(ko.report.notReadyTitle);
    expect(container.textContent).toContain(ko.report.notReadyBody);
    expect(sectionKeys(container)).toEqual([]);
    expect(
      Array.from(container.querySelectorAll('button')).some(
        (button) => button.textContent === ko.report.retry,
      ),
    ).toBe(false);
    mounted?.unmount();
    vi.unstubAllGlobals();

    // 3. 불러오기에 실패하면 다시 시도를 보이고, 누르면 다시 불러와 네 구역을 보인다.
    let failing = true;
    stubFetch({
      '/v1/sessions/s-flaky': () =>
        failing ? json(500, { message: 'boom' }) : json(200, state('s-flaky', true)),
      '/v1/sessions/s-flaky/report': () => json(200, REPORT),
    });
    container = render('s-flaky');
    await flush();
    expect(container.textContent).toContain(ko.report.failedTitle);
    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === ko.report.retry,
    );
    expect(retry).toBeDefined();

    failing = false;
    if (retry) click(retry);
    await flush();
    expect(container.textContent).not.toContain(ko.report.failedTitle);
    expect(sectionKeys(container)).toEqual(['journey', 'emotions', 'keepsake', 'encouragement']);
  });
});

describe('ReportScreen 빈 리포트', () => {
  it('절 배열이 비어 있으면 네 구역 제목 없이 안내 문장만 보인다', async () => {
    const empty: MindReport = { ...REPORT, sections: [] };
    stubFetch({
      '/v1/sessions/s-short': () => json(200, state('s-short', true)),
      '/v1/sessions/s-short/report': () => json(200, empty),
    });
    const container = render('s-short');
    await flush();
    expect(container.textContent).toContain(ko.report.emptyTitle);
    expect(container.textContent).toContain(ko.report.emptyBody);
    expect(sectionKeys(container)).toEqual([]);
    for (const heading of Object.values(ko.reportSections)) {
      expect(container.textContent).not.toContain(heading);
    }
    expect(container.textContent).not.toContain(ko.report.title('테스트콩'));
    expect(container.textContent).not.toContain(ko.report.failedTitle);
  });
});

describe('ReportScreen 표지와 감정 칩', () => {
  const longDate = (iso: string) =>
    new Intl.DateTimeFormat('ko', { dateStyle: 'long' }).format(new Date(iso));

  it('표지 날짜는 대화를 시작한 날이고, emotions 구역에 감정 칩이 보인다', async () => {
    stubFetch({
      '/v1/sessions/s-tags': () => json(200, state('s-tags', true)),
      '/v1/sessions/s-tags/report': () => json(200, REPORT),
    });
    const container = render('s-tags');
    await flush();
    const header = container.querySelector('header')?.textContent ?? '';
    expect(header).toContain(longDate(REPORT.startedAt));
    expect(header).not.toContain(longDate(REPORT.at));
    const chips = container.querySelectorAll('[data-section="emotions"] [data-emotion-tag]');
    expect(Array.from(chips, (chip) => chip.textContent)).toEqual(['그리움', '고마움', '미안함']);
  });

  it('감정 낱말이 없는 옛 리포트는 칩 줄을 생략한다', async () => {
    const old: MindReport = {
      ...REPORT,
      sections: REPORT.sections.map(({ tags: _tags, ...section }) => section),
    };
    stubFetch({
      '/v1/sessions/s-old': () => json(200, state('s-old', true)),
      '/v1/sessions/s-old/report': () => json(200, old),
    });
    const container = render('s-old');
    await flush();
    expect(sectionKeys(container)).toEqual(['journey', 'emotions', 'keepsake', 'encouragement']);
    expect(container.querySelector('[data-emotion-tags]')).toBeNull();
  });
});

describe('ReportScreen 리포트 지우기', () => {
  /** 방법과 경로로 답을 고르는 가짜 fetch. 답이 함수면 그 약속을 기다린다. */
  function stubServer(routes: Record<string, Route>) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const route = routes[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
      return route ? route() : json(404, { message: 'Not found' });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const ready = (sessionId: string) => ({
    [`GET /v1/sessions/${sessionId}`]: () => json(200, state(sessionId, true)),
    [`GET /v1/sessions/${sessionId}/report`]: () => json(200, REPORT),
  });
  const named = (root: ParentNode, name: string) =>
    Array.from(root.querySelectorAll('button')).find((button) => button.textContent === name);
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const toastText = (role: 'status' | 'alert') =>
    Array.from(document.querySelectorAll(`[role="${role}"]`), (node) => node.textContent).join('|');

  it('취소하면 확인창이 닫히고 포커스가 "리포트 지우기"로 돌아온다', async () => {
    stubServer(ready('s-del'));
    const container = render('s-del');
    await flush();
    const remove = named(container, ko.report.deleteReport);
    expect(remove).toBeDefined();
    remove?.focus();
    if (remove) click(remove);
    expect(dialog()?.textContent).toContain(ko.report.confirmDeleteTitle);
    expect(dialog()?.textContent).toContain(ko.report.confirmDeleteBody);

    const cancel = dialog() && named(dialog() as HTMLElement, ko.report.cancel);
    if (cancel) click(cancel);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(remove);
  });

  it('확인하면 지우는 동안 busy, 끝나면 목록으로 간다', async () => {
    let finish: (response: Response) => void = () => undefined;
    stubServer({
      ...ready('s-del'),
      'DELETE /v1/sessions/s-del/report': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    const container = render('s-del');
    await flush();
    const remove = named(container, ko.report.deleteReport);
    if (remove) click(remove);
    const confirm = dialog() && named(dialog() as HTMLElement, ko.report.confirmDelete);
    if (confirm) click(confirm);
    await flush();
    expect(confirm?.getAttribute('aria-busy')).toBe('true');
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => finish(new Response(null, { status: 204 })));
    await flush();
    expect(router.push).toHaveBeenCalledWith('/sessions?notice=reportDeleted');
  });

  it('지우지 못하면 확인창을 닫고 오류 토스트가 머문다', async () => {
    stubServer({
      ...ready('s-del'),
      'DELETE /v1/sessions/s-del/report': () => json(500, { message: 'boom' }),
    });
    const container = render('s-del');
    await flush();
    const remove = named(container, ko.report.deleteReport);
    if (remove) click(remove);
    const confirm = dialog() && named(dialog() as HTMLElement, ko.report.confirmDelete);
    if (confirm) click(confirm);
    await flush();
    expect(dialog()).toBeNull();
    expect(toastText('alert')).toContain(ko.toast.reportDeleteFailed);
    expect(router.push).not.toHaveBeenCalled();
    expect(sectionKeys(container)).toEqual(['journey', 'emotions', 'keepsake', 'encouragement']);
  });

  it('목록에서 되살려 오면 토스트를 보이고 주소의 표시를 지운다', async () => {
    window.history.replaceState(null, '', '/sessions/s-back/report?notice=reportRestored');
    stubServer(ready('s-back'));
    render('s-back');
    await flush();
    expect(toastText('status')).toContain(ko.toast.reportRestored);
    expect(window.location.search).toBe('');
  });
});
