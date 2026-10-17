// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount } from '@/components/ui/test-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import type { MindReport, SessionStateView } from '@/lib/api';
import { ReportScreen } from './ReportScreen';

// 지어낸 값이다. 실제 사용자의 대화나 리포트가 아니다.
const REPORT: MindReport = {
  at: '2026-10-12T09:00:00.000Z',
  petName: '테스트콩',
  reachedTask: 2,
  progress: 0.25,
  locale: 'ko',
  sections: [
    { key: 'journey', body: '지어낸 걸어온 길' },
    { key: 'emotions', body: '지어낸 감정' },
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
