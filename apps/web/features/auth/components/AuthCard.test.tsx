// @vitest-environment jsdom
// 첫 화면 카드의 상태 전환. 서버는 auth.api 를 가짜로 바꿔 끼우고, 스토어는 진짜를 쓴다.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount } from '@/components/ui/test-dom';
import * as api from '@/features/auth/auth.api';
import { useAuthStore } from '@/features/auth/auth.store';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import { AuthCard } from './AuthCard';

vi.mock('@/features/auth/auth.api', () => ({
  me: vi.fn(),
  setupStatus: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  setup: vi.fn(),
  logout: vi.fn(),
  updateChatLanguage: vi.fn(),
}));

const fake = vi.mocked(api);

let mounted: Mounted | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({
    principal: undefined,
    ready: false,
    busy: false,
    error: undefined,
    setupRequired: false,
    registered: false,
  });
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

/** 로그아웃 상태로 /me 를 거절하고, setup 여부를 정해 init 을 끝낸 뒤 카드를 그린다. */
async function renderSignedOut({ setupRequired }: { setupRequired: boolean }) {
  fake.me.mockRejectedValue(new Error('Unauthorized'));
  fake.setupStatus.mockResolvedValue({ required: setupRequired });
  await act(async () => {
    await useAuthStore.getState().init();
  });
  mounted = mount(
    <I18nProvider initialLocale="ko">
      <AuthCard />
    </I18nProvider>,
  );
  return mounted.container;
}

function field(container: HTMLElement, name: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!found) throw new Error(`input ${name} not rendered`);
  return found;
}

/** React 가 듣는 방식으로 입력 값을 바꾼다. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>('form button[type="submit"]');
  if (!button) throw new Error('submit button not rendered');
  await act(async () => {
    button.click();
  });
}

function buttonWithText(container: HTMLElement, text: string): HTMLElement {
  const found = Array.from(container.querySelectorAll<HTMLElement>('button, a')).find(
    (element) => element.textContent?.trim() === text,
  );
  if (!found) throw new Error(`control "${text}" not rendered`);
  return found;
}

describe('AuthCard (첫 화면 카드)', () => {
  it('setup 이 필요하면 로그인 대신 첫 관리자 설정 카드를 보인다', async () => {
    const container = await renderSignedOut({ setupRequired: true });
    expect(container.querySelector('h2')?.textContent).toBe(ko.auth.setupTitle);
    expect(field(container, 'token').className).toContain('font-mono');
    expect(container.querySelector('input[name="company"]')).toBeNull();
  });

  it('로그인이 실패하면 카드 안에 오류 글을 보이고 입력을 지우지 않는다', async () => {
    const container = await renderSignedOut({ setupRequired: false });
    expect(container.querySelector('h2')?.textContent).toBe(ko.auth.welcome);
    fake.login.mockRejectedValue(new Error('Invalid credentials'));

    type(field(container, 'username'), 'haneul');
    type(field(container, 'password'), 'wrong-pass');
    await submit(container);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(ko.auth.loginFailed);
    expect(field(container, 'password').getAttribute('aria-invalid')).toBe('true');
    expect(field(container, 'username').value).toBe('haneul');
    expect(field(container, 'password').value).toBe('wrong-pass');
  });

  it('신청을 제출하면 완료 안내와 도움받을 곳 링크를 보인다', async () => {
    const container = await renderSignedOut({ setupRequired: false });
    fake.register.mockResolvedValue(undefined);

    click(buttonWithText(container, ko.auth.registerLink));
    expect(container.querySelector('h2')?.textContent).toBe(ko.auth.registerTitle);

    type(field(container, 'username'), 'haneul');
    type(field(container, 'password'), 'long-enough-pass');
    type(field(container, 'company'), 'Example Clinic');
    await submit(container);

    expect(fake.register).toHaveBeenCalledWith('haneul', 'long-enough-pass', 'Example Clinic');
    expect(container.querySelector('h2')?.textContent).toBe(ko.auth.registerDoneTitle);
    expect(container.querySelector('a[href="/help"]')).not.toBeNull();
    click(buttonWithText(container, ko.auth.backToLogin));
    expect(container.querySelector('h2')?.textContent).toBe(ko.auth.welcome);
  });
});
