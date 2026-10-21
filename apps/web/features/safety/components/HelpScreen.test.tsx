// @vitest-environment jsdom
// /help 의 좁은 폭 배치를 바꾸면서 지키는 것: 두 언어 모두 번호 줄 둘(tel:)과 112·119 줄이 남고,
// "처음으로" 링크는 좁은 폭에서 터치 타깃 44px(max-sm:min-h-11)을 가진다(jsdom 은 배치를 재지 않아 클래스로 본다).
import { afterEach, describe, expect, it } from 'vitest';
import { type Mounted, mount } from '@/components/ui/test-dom';
import { en } from '@/i18n/en';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import { HelpScreen } from './HelpScreen';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function render(locale: 'ko' | 'en') {
  mounted = mount(
    <I18nProvider initialLocale={locale}>
      <HelpScreen theme="hanji" />
    </I18nProvider>,
  );
  return mounted.container;
}

describe('HelpScreen (/help)', () => {
  it.each([
    ['ko', ko],
    ['en', en],
  ] as const)('%s: 번호 줄 둘이 tel: 링크이고 112·119 줄이 있다', (locale, messages) => {
    const container = render(locale);
    const hrefs = Array.from(container.querySelectorAll('a[href^="tel:"]'), (a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['tel:109', 'tel:15771366']);
    expect(container.textContent).toContain(messages.safety.emergency);
  });

  it('"처음으로" 링크는 좁은 폭에서 44px 터치 타깃을 가진다', () => {
    const container = render('ko');
    const home = Array.from(container.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/',
    );
    expect(home?.textContent).toContain(ko.help.toHome);
    expect(home?.className.split(/\s+/)).toContain('max-sm:min-h-11');
  });
});
