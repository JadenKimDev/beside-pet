// @vitest-environment jsdom
// 보호 경로의 판정: 로그인 확인이 끝났는데 로그인 정보가 없으면 첫 화면으로 보낸다.
// 공개 경로는 로그인 확인(init)도 부르지 않는다(/help 는 서버가 내려가 있어도 열린다). 값은 모두 지어낸 것이다.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Mounted, mount } from '@/components/ui/test-dom';
import { useAuthStore } from '@/features/auth/auth.store';
import { AuthGuard } from './AuthGuard';

const nav = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn() },
  pathname: '/sessions',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => nav.pathname,
}));

const principal = { id: 'u-1', username: '하늘', company: '지어낸 회사', role: 'viewer' as const };
const init = vi.fn(async () => {});

let mounted: Mounted | undefined;
beforeEach(() => {
  nav.router.replace.mockReset();
  nav.pathname = '/sessions';
  init.mockReset();
  init.mockImplementation(async () => {});
  useAuthStore.setState({ ready: false, principal: undefined, init });
});
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

function render(path: string) {
  nav.pathname = path;
  mounted = mount(
    <AuthGuard>
      <p data-testid="page">page</p>
    </AuthGuard>,
  );
  return mounted.container;
}

const page = (container: HTMLElement) => container.querySelector('[data-testid="page"]');

describe('AuthGuard', () => {
  it('보호 경로에서 로그인 확인이 끝났는데 로그인 정보가 없으면 첫 화면으로 보낸다', () => {
    useAuthStore.setState({ ready: true, principal: undefined });
    for (const path of [
      '/sessions',
      '/sessions/abc/report',
      '/settings',
      '/session',
      '/onboarding',
    ]) {
      nav.router.replace.mockReset();
      const container = render(path);
      expect(nav.router.replace).toHaveBeenCalledWith('/');
      expect(page(container)).toBeNull();
      mounted?.unmount();
      mounted = undefined;
    }
  });

  it('보호 경로에서 로그인 정보가 있으면 보내지 않고 화면을 그린다', () => {
    useAuthStore.setState({ ready: true, principal });
    const container = render('/sessions');
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    expect(page(container)).not.toBeNull();
  });

  it('보호 경로에서 확인 전이면 init 을 한 번 부르고 판정 전에는 화면을 그리지 않는다', async () => {
    const container = render('/settings');
    expect(init).toHaveBeenCalledTimes(1);
    expect(page(container)).toBeNull();
    expect(nav.router.replace).not.toHaveBeenCalled();

    await act(async () => {
      useAuthStore.setState({ ready: true, principal: undefined });
    });
    expect(nav.router.replace).toHaveBeenCalledWith('/');
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('확인 뒤 로그인 정보가 있으면 화면을 그린다', async () => {
    const container = render('/session');
    await act(async () => {
      useAuthStore.setState({ ready: true, principal });
    });
    expect(page(container)).not.toBeNull();
    expect(nav.router.replace).not.toHaveBeenCalled();
  });

  it('공개 경로는 로그인 정보가 없어도 보내지 않고, init 도 부르지 않고 바로 그린다', () => {
    for (const ready of [false, true]) {
      useAuthStore.setState({ ready, principal: undefined });
      for (const path of ['/', '/help', '/nowhere']) {
        const container = render(path);
        expect(page(container)).not.toBeNull();
        mounted?.unmount();
        mounted = undefined;
      }
    }
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });
});
