// 서버가 세션을 거절하면(UNAUTHORIZED_STATUS) 공용 전송이 auth 의 처리기를 부르고, 처리기는 로그인 정보를 비우고 첫 화면으로 보낸다.
// 서버는 가짜 fetch 로 대신한다. 값은 모두 지어낸 것이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, UNAUTHORIZED_STATUS } from '@/lib/http';
import { goHome } from './auth.redirect';
import { useAuthStore } from './auth.store';

vi.mock('./auth.redirect', () => ({ goHome: vi.fn() }));

const respond = (status: number, body: object) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );

beforeEach(() => {
  vi.mocked(goHome).mockReset();
  useAuthStore.setState({
    ready: true,
    principal: { id: 'u-1', username: '하늘', company: '지어낸 회사', role: 'viewer' },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('세션 거절 처리기', () => {
  it('로그인된 채 세션 거절을 받으면 로그인 정보를 비우고 첫 화면으로 보낸다. 호출자는 실패를 받는다', async () => {
    respond(UNAUTHORIZED_STATUS, { message: 'Account is unavailable' });
    await expect(http.get('/v1/sessions')).rejects.toMatchObject({ status: UNAUTHORIZED_STATUS });
    expect(useAuthStore.getState().principal).toBeUndefined();
    expect(goHome).toHaveBeenCalledTimes(1);
  });

  it('대화 스트림이 거절돼도 같다', async () => {
    respond(UNAUTHORIZED_STATUS, { message: 'Unauthorized' });
    const frames = http.streamFrames('/v1/sessions/s-1/stream', { content: '지어낸 말' });
    await expect(
      (async () => {
        for await (const _frame of frames) {
          // drain
        }
      })(),
    ).rejects.toThrow();
    expect(useAuthStore.getState().principal).toBeUndefined();
    expect(goHome).toHaveBeenCalledTimes(1);
  });

  it('다른 실패는 로그인 정보를 두고 이동하지 않는다', async () => {
    respond(503, { message: 'down' });
    await expect(http.get('/v1/sessions')).rejects.toMatchObject({ status: 503 });
    expect(useAuthStore.getState().principal).toBeDefined();
    expect(goHome).not.toHaveBeenCalled();
  });

  it('로그인 정보가 없을 때의 거절(로그인 실패 등)은 이동하지 않는다', async () => {
    useAuthStore.setState({ principal: undefined });
    respond(UNAUTHORIZED_STATUS, { message: 'Invalid credentials' });
    await useAuthStore.getState().login('하늘', '틀린-비밀번호');
    expect(goHome).not.toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBe('Invalid credentials');
  });
});
