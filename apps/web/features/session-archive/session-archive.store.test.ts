// 보관함 읽기, 되살리기, 리포트 지우기와 되살리기의 상태 전환과 호출 경로.
// 서버는 가짜 fetch 로 대신한다. 값은 모두 지어낸 것이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeletedSessionItem, MindReport, SessionListItem, SessionStateView } from '@/lib/api';
import { fakeServer } from '@/lib/data/test-server';
import { homeView, useSessionArchiveStore } from './session-archive.store';

const item: SessionListItem = {
  sessionId: 'sess-a',
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
const trashed: DeletedSessionItem = {
  sessionId: 'sess-b',
  startedAt: '2026-10-10T08:00:00Z',
  deletedAt: '2026-10-20T09:00:00Z',
  purgeAt: '2027-01-20T09:00:00Z',
  petName: '콩이',
  preferredLanguage: 'ko',
};
const restoredState: SessionStateView = {
  sessionId: 'sess-b',
  task: 2,
  progress: 0.25,
  supportLevel: 1,
  closed: true,
  reportAvailable: true,
};
const report: MindReport = {
  at: '2026-10-12T13:00:00Z',
  startedAt: '2026-10-12T12:12:00Z',
  petName: '보리',
  reachedTask: 2,
  progress: 0.25,
  locale: 'ko',
  sections: [{ key: 'journey', body: '지어낸 본문' }],
};

const initial = useSessionArchiveStore.getState();
beforeEach(() => {
  useSessionArchiveStore.setState(initial, true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('보관함 읽기', () => {
  it('처음에는 비어 있고 idle 이다', () => {
    const state = useSessionArchiveStore.getState();
    expect(state.trash).toBeUndefined();
    expect(state.trashStatus).toBe('idle');
  });

  it('loading 을 거쳐 ready 에 지운 대화를 둔다', async () => {
    fakeServer({ 'GET /v1/sessions/deleted': { status: 200, body: [trashed] } });
    const pending = useSessionArchiveStore.getState().loadTrash();
    expect(useSessionArchiveStore.getState().trashStatus).toBe('loading');
    await pending;
    expect(useSessionArchiveStore.getState().trashStatus).toBe('ready');
    expect(useSessionArchiveStore.getState().trash).toEqual([trashed]);
  });

  it('실패하면 failed 이고 목록을 비운다', async () => {
    fakeServer({ 'GET /v1/sessions/deleted': { status: 503, body: { message: 'down' } } });
    await useSessionArchiveStore.getState().loadTrash();
    expect(useSessionArchiveStore.getState().trashStatus).toBe('failed');
    expect(useSessionArchiveStore.getState().trash).toBeUndefined();
  });
});

describe('되살리기', () => {
  it('되살린 뒤 보관함을 다시 읽고, 대화 목록은 다음에 다시 읽도록 비운다', async () => {
    const server = fakeServer({
      'POST /v1/sessions/sess-b/restore': { status: 200, body: restoredState },
      'GET /v1/sessions/deleted': { status: 200, body: [] },
    });
    useSessionArchiveStore.setState({
      trash: [trashed],
      trashStatus: 'ready',
      items: [item],
      listStatus: 'ready',
    });
    const pending = useSessionArchiveStore.getState().restoreSession('sess-b');
    expect(useSessionArchiveStore.getState().busy).toBe(true);
    await pending;
    const state = useSessionArchiveStore.getState();
    expect(server.calls).toEqual([
      { method: 'POST', path: '/v1/sessions/sess-b/restore' },
      { method: 'GET', path: '/v1/sessions/deleted' },
    ]);
    expect(state.trash).toEqual([]);
    expect(state.items).toBeUndefined();
    expect(state.listStatus).toBe('idle');
    expect(state.busy).toBe(false);
  });

  it('실패하면 호출자가 실패를 받고 busy 가 풀리며 보관함은 그대로다', async () => {
    fakeServer({ 'POST /v1/sessions/sess-b/restore': { status: 500, body: { message: 'x' } } });
    useSessionArchiveStore.setState({ trash: [trashed], trashStatus: 'ready' });
    await expect(useSessionArchiveStore.getState().restoreSession('sess-b')).rejects.toThrow();
    const state = useSessionArchiveStore.getState();
    expect(state.busy).toBe(false);
    expect(state.trash).toEqual([trashed]);
  });
});

describe('대화 삭제', () => {
  it('지운 뒤 목록을 다시 읽고, 보관함은 다음에 다시 읽도록 비운다', async () => {
    const server = fakeServer({
      'DELETE /v1/sessions/sess-a': { status: 204 },
      'GET /v1/sessions': { status: 200, body: [] },
    });
    useSessionArchiveStore.setState({
      items: [item],
      listStatus: 'ready',
      trash: [trashed],
      trashStatus: 'ready',
    });
    await useSessionArchiveStore.getState().removeSession('sess-a');
    const state = useSessionArchiveStore.getState();
    expect(server.calls).toEqual([
      { method: 'DELETE', path: '/v1/sessions/sess-a' },
      { method: 'GET', path: '/v1/sessions' },
    ]);
    expect(state.items).toEqual([]);
    expect(state.trash).toBeUndefined();
    expect(state.trashStatus).toBe('idle');
    expect(state.busy).toBe(false);
  });
});

describe('리포트 지우기', () => {
  it('지운 뒤 들고 있던 그 리포트를 버리고 목록을 다시 읽는다', async () => {
    const server = fakeServer({
      'DELETE /v1/sessions/sess-a/report': { status: 204 },
      'GET /v1/sessions': {
        status: 200,
        body: [{ ...item, reportAvailable: false, reportDeleted: true }],
      },
    });
    useSessionArchiveStore.setState({ reportId: 'sess-a', report, reportStatus: 'ready' });
    await useSessionArchiveStore.getState().removeReport('sess-a');
    const state = useSessionArchiveStore.getState();
    expect(server.calls).toEqual([
      { method: 'DELETE', path: '/v1/sessions/sess-a/report' },
      { method: 'GET', path: '/v1/sessions' },
    ]);
    expect(state.report).toBeUndefined();
    expect(state.reportStatus).toBe('idle');
    expect(state.items?.[0].reportDeleted).toBe(true);
    expect(state.busy).toBe(false);
  });

  it('다른 대화의 리포트를 들고 있으면 그대로 둔다', async () => {
    fakeServer({
      'DELETE /v1/sessions/sess-a/report': { status: 204 },
      'GET /v1/sessions': { status: 200, body: [] },
    });
    useSessionArchiveStore.setState({ reportId: 'sess-z', report, reportStatus: 'ready' });
    await useSessionArchiveStore.getState().removeReport('sess-a');
    expect(useSessionArchiveStore.getState().report).toEqual(report);
    expect(useSessionArchiveStore.getState().reportStatus).toBe('ready');
  });

  it('실패하면 호출자가 실패를 받고 busy 가 풀리며 리포트는 그대로다', async () => {
    fakeServer({ 'DELETE /v1/sessions/sess-a/report': { status: 404, body: { message: 'x' } } });
    useSessionArchiveStore.setState({ reportId: 'sess-a', report, reportStatus: 'ready' });
    await expect(useSessionArchiveStore.getState().removeReport('sess-a')).rejects.toThrow();
    expect(useSessionArchiveStore.getState().busy).toBe(false);
    expect(useSessionArchiveStore.getState().report).toEqual(report);
  });
});

describe('리포트 되살리기', () => {
  it('되살린 리포트를 리포트 칸에 ready 로 두고 목록을 다시 읽는다', async () => {
    const server = fakeServer({
      'POST /v1/sessions/sess-c/report/restore': { status: 200, body: report },
      'GET /v1/sessions': { status: 200, body: [item] },
    });
    await useSessionArchiveStore.getState().restoreReport('sess-c');
    const state = useSessionArchiveStore.getState();
    expect(server.calls).toEqual([
      { method: 'POST', path: '/v1/sessions/sess-c/report/restore' },
      { method: 'GET', path: '/v1/sessions' },
    ]);
    expect(state.reportId).toBe('sess-c');
    expect(state.report).toEqual(report);
    expect(state.reportStatus).toBe('ready');
    expect(state.items).toEqual([item]);
    expect(state.busy).toBe(false);
  });

  it('실패하면 호출자가 실패를 받고 busy 가 풀린다', async () => {
    fakeServer({
      'POST /v1/sessions/sess-c/report/restore': { status: 404, body: { message: 'x' } },
    });
    await expect(useSessionArchiveStore.getState().restoreReport('sess-c')).rejects.toThrow();
    expect(useSessionArchiveStore.getState().busy).toBe(false);
    expect(useSessionArchiveStore.getState().report).toBeUndefined();
  });
});

describe('첫 화면 판정 homeView', () => {
  const ready = { listStatus: 'ready', trashStatus: 'ready' } as const;

  it('목록 0·보관함 1 이면 emptyWithTrash 다', () => {
    expect(homeView({ ...ready, items: [], trash: [trashed] })).toBe('emptyWithTrash');
  });

  it('목록 0·보관함 0 이면 onboarding 이다', () => {
    expect(homeView({ ...ready, items: [], trash: [] })).toBe('onboarding');
  });

  it('목록이 있으면 보관함과 상관없이 list 다', () => {
    expect(homeView({ listStatus: 'ready', items: [item], trashStatus: 'idle' })).toBe('list');
  });

  it('목록이 비었고 보관함을 아직 모르면 loading 이다', () => {
    expect(homeView({ listStatus: 'ready', items: [], trashStatus: 'idle' })).toBe('loading');
    expect(homeView({ listStatus: 'ready', items: [], trashStatus: 'loading' })).toBe('loading');
    expect(homeView({ listStatus: 'loading', trashStatus: 'idle' })).toBe('loading');
  });

  it('목록이나 보관함을 불러오지 못하면 failed 다(온보딩으로 보내지 않는다)', () => {
    expect(homeView({ listStatus: 'failed', trashStatus: 'idle' })).toBe('failed');
    expect(homeView({ listStatus: 'ready', items: [], trashStatus: 'failed' })).toBe('failed');
  });
});
