// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { type Mounted, mount } from '@/components/ui/test-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import { CrisisResources } from './CrisisResources';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function render() {
  mounted = mount(
    <I18nProvider initialLocale="ko">
      <CrisisResources />
    </I18nProvider>,
  );
  return mounted.container;
}

describe('CrisisResources (위기 카드)', () => {
  it('제목으로 이름 붙은 region 이다', () => {
    const container = render();
    const region = container.querySelector('[role="region"]');
    const titleId = region?.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? '')?.textContent).toBe(ko.crisis.title);
  });

  it('나타나면 포커스를 제목으로 옮긴다', () => {
    const container = render();
    const titleId = container.querySelector('[role="region"]')?.getAttribute('aria-labelledby');
    expect(document.activeElement?.id).toBe(titleId);
  });

  it('번호 줄 둘이 tel: 링크이고 112·119 줄이 있다', () => {
    const container = render();
    const hrefs = Array.from(container.querySelectorAll('a[href^="tel:"]'), (a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['tel:109', 'tel:15771366']);
    expect(container.textContent).toContain(ko.safety.emergency);
  });
});
