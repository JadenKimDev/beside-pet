// 지운 대화 보관함과 리포트 지우기의 호출 경로, 그리고 리포트 캐시의 무효화.
// 서버는 가짜 fetch 로 대신한다. 값은 모두 지어낸 것이다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeletedSessionItem, MindReport, SessionStateView } from '@/lib/api';
import { fakeServer } from './test-server';

/** 리포트 캐시는 모듈 안에 있으므로 테스트마다 새로 불러온다. */
const loadData = async () => {
  vi.resetModules();
  return import('./index');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const report: MindReport = {
  at: '2026-10-12T13:00:00Z',
  startedAt: '2026-10-12T12:12:00Z',
  petName: '보리',
  reachedTask: 2,
  progress: 0.25,
  locale: 'ko',
  sections: [{ key: 'journey', body: '지어낸 본문' }],
};
const state: SessionStateView = {
  sessionId: 'sess-1',
  task: 2,
  progress: 0.25,
  supportLevel: 1,
  closed: true,
  reportAvailable: true,
};
const trashed: DeletedSessionItem = {
  sessionId: 'sess-1',
  startedAt: '2026-10-12T12:12:00Z',
  deletedAt: '2026-10-20T09:00:00Z',
  purgeAt: '2027-01-20T09:00:00Z',
  petName: '보리',
  preferredLanguage: 'ko',
};

describe('보관함 호출', () => {
  it('보관함 목록은 GET /v1/sessions/deleted 를 부르고 받은 배열을 그대로 준다', async () => {
    const server = fakeServer({ 'GET /v1/sessions/deleted': { status: 200, body: [trashed] } });
    const data = await loadData();
    await expect(data.listDeletedSessions()).resolves.toEqual([trashed]);
    expect(server.calls).toEqual([{ method: 'GET', path: '/v1/sessions/deleted' }]);
  });

  it('보관함은 캐시하지 않는다: 두 번 부르면 두 번 묻는다', async () => {
    const server = fakeServer({ 'GET /v1/sessions/deleted': { status: 200, body: [] } });
    const data = await loadData();
    await data.listDeletedSessions();
    await data.listDeletedSessions();
    expect(server.count('GET', '/v1/sessions/deleted')).toBe(2);
  });

  it('되살리기는 POST /v1/sessions/{id}/restore 이고 세션 상태를 준다', async () => {
    const server = fakeServer({ 'POST /v1/sessions/sess-1/restore': { status: 200, body: state } });
    const data = await loadData();
    await expect(data.restoreSession('sess-1')).resolves.toEqual(state);
    expect(server.calls).toEqual([{ method: 'POST', path: '/v1/sessions/sess-1/restore' }]);
  });

  it('대화 삭제는 그대로 DELETE /v1/sessions/{id} 다', async () => {
    const server = fakeServer({ 'DELETE /v1/sessions/sess-1': { status: 204 } });
    const data = await loadData();
    await data.deleteSession('sess-1');
    expect(server.calls).toEqual([{ method: 'DELETE', path: '/v1/sessions/sess-1' }]);
  });
});

describe('리포트 지우기와 되살리기', () => {
  it('리포트 지우기는 DELETE /v1/sessions/{id}/report 이고, 들고 있던 리포트를 버린다', async () => {
    const server = fakeServer({
      'GET /v1/sessions/sess-1/report': { status: 200, body: report },
      'DELETE /v1/sessions/sess-1/report': { status: 204 },
    });
    const data = await loadData();
    await data.getReport('sess-1');
    await data.deleteReport('sess-1');
    expect(server.count('DELETE', '/v1/sessions/sess-1/report')).toBe(1);
    // 지운 뒤 다시 읽으면 캐시가 아니라 서버에 묻는다.
    await data.getReport('sess-1');
    expect(server.count('GET', '/v1/sessions/sess-1/report')).toBe(2);
  });

  it('리포트 되살리기는 POST /v1/sessions/{id}/report/restore 이고, 받은 리포트를 캐시에 둔다', async () => {
    const server = fakeServer({
      'POST /v1/sessions/sess-1/report/restore': { status: 200, body: report },
    });
    const data = await loadData();
    await expect(data.restoreReport('sess-1')).resolves.toEqual(report);
    await expect(data.getReport('sess-1')).resolves.toEqual(report);
    expect(server.count('POST', '/v1/sessions/sess-1/report/restore')).toBe(1);
    expect(server.count('GET', '/v1/sessions/sess-1/report')).toBe(0);
  });

  it('대화를 지우면 들고 있던 리포트도 버린다', async () => {
    const server = fakeServer({
      'GET /v1/sessions/sess-1/report': { status: 200, body: report },
      'DELETE /v1/sessions/sess-1': { status: 204 },
    });
    const data = await loadData();
    await data.getReport('sess-1');
    await data.deleteSession('sess-1');
    await data.getReport('sess-1');
    expect(server.count('GET', '/v1/sessions/sess-1/report')).toBe(2);
  });

  it('되살린 대화의 리포트는 서버에서 새로 읽는다', async () => {
    const server = fakeServer({
      'GET /v1/sessions/sess-1/report': { status: 200, body: report },
      'POST /v1/sessions/sess-1/restore': { status: 200, body: state },
    });
    const data = await loadData();
    await data.getReport('sess-1');
    await data.restoreSession('sess-1');
    await data.getReport('sess-1');
    expect(server.count('GET', '/v1/sessions/sess-1/report')).toBe(2);
  });
});
