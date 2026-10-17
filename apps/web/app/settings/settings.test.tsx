// @vitest-environment jsdom
// 설정의 상태 전환: 테마 세그먼트를 고르면 쿠키 저장 함수와 <html data-theme> 이 바뀌고,
// 대화 언어 저장이 실패하면 오류 토스트를 띄우고 세그먼트를 이전 값으로 되돌린다.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount } from '@/components/ui/test-dom';

const { persistTheme, updateChatLanguage } = vi.hoisted(() => ({
  persistTheme: vi.fn(async (_theme: string) => undefined),
  updateChatLanguage: vi.fn(),
}));
vi.mock('@/theme/persist-theme', () => ({ persistTheme }));
vi.mock('@/i18n/persist-locale', () => ({ persistLocale: async () => undefined }));
vi.mock('@/features/auth/auth.api', () => ({ updateChatLanguage }));

import { useAuthStore } from '@/features/auth/auth.store';
import { ChatLanguageSelect } from '@/features/auth/components/ChatLanguageSelect';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import { ThemeSelect } from './ThemeSelect';

let mounted: Mounted | undefined;

const PRINCIPAL = {
  id: 'u-1',
  username: 'tester-bori',
  company: '보리상회',
  role: 'viewer' as const,
  chatLanguage: 'ko' as const,
};

beforeEach(() => {
  document.documentElement.dataset.theme = 'hanji';
  useAuthStore.setState({ principal: PRINCIPAL, error: undefined });
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  persistTheme.mockClear();
  updateChatLanguage.mockReset();
});

function group(label: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[role="group"][aria-label="${label}"]`);
  if (!found) throw new Error(`no group ${label}`);
  return found;
}

function button(scope: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`no button ${text}`);
  return found;
}

const pressed = (scope: HTMLElement): string[] =>
  Array.from(scope.querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent ?? '');

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('설정: 테마 세그먼트', () => {
  it('지금 테마가 눌려 있고, 다른 테마를 고르면 쿠키에 쓰고 data-theme 을 바로 바꾼다', async () => {
    mounted = mount(
      <I18nProvider initialLocale="ko">
        <ThemeSelect />
      </I18nProvider>,
    );
    const themes = group(ko.settings.theme);
    expect(pressed(themes)).toEqual([expect.stringContaining(ko.settings.themeNames.hanji)]);

    click(button(themes, ko.settings.themeNames.night));
    await flush();

    expect(persistTheme).toHaveBeenCalledWith('night');
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(pressed(themes)).toEqual([expect.stringContaining(ko.settings.themeNames.night)]);
  });
});

describe('설정: 대화 언어 세그먼트', () => {
  it('저장되면 토스트로 알린다', async () => {
    updateChatLanguage.mockResolvedValue({ ...PRINCIPAL, chatLanguage: 'en' });
    mounted = mount(
      <I18nProvider initialLocale="ko">
        <ChatLanguageSelect />
      </I18nProvider>,
    );
    const languages = group(ko.auth.chatLanguage);
    click(button(languages, 'English'));
    await flush();

    expect(updateChatLanguage).toHaveBeenCalledWith('en');
    expect(pressed(languages)).toEqual(['English']);
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      ko.toast.chatLanguageSaved('English'),
    );
  });

  it('저장에 실패하면 오류 토스트를 띄우고 이전 값으로 되돌린다', async () => {
    let reject: (error: Error) => void = () => undefined;
    updateChatLanguage.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    mounted = mount(
      <I18nProvider initialLocale="ko">
        <ChatLanguageSelect />
      </I18nProvider>,
    );
    const languages = group(ko.auth.chatLanguage);
    click(button(languages, 'English'));
    // 기다리는 동안은 고른 값이 눌려 있다.
    expect(pressed(languages)).toEqual(['English']);

    await act(async () => {
      reject(new Error('boom'));
    });
    await flush();

    expect(pressed(languages)).toEqual(['한국어']);
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(ko.toast.saveFailed);
    expect(alert?.textContent).toContain(ko.common.retry);
  });
});
