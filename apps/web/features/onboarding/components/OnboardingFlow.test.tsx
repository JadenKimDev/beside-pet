// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, type Mounted, mount, pressKey } from '@/components/ui/test-dom';
import { LOCALE_LABELS } from '@/i18n/config';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import type { GriefProfile } from '@/lib/api';
import { useOnboardingStore } from '../onboarding.store';
import { OnboardingFlow } from './OnboardingFlow';

// 지어낸 이름. 실제 사용자의 반려동물 이름이 아니다.
const PET = 'Bori';

let mounted: Mounted | undefined;
let onBegin: ReturnType<typeof vi.fn<(profile: GriefProfile) => void>>;

beforeEach(() => {
  useOnboardingStore.getState().reset();
  onBegin = vi.fn<(profile: GriefProfile) => void>();
  mounted = mount(
    <I18nProvider initialLocale="ko">
      <OnboardingFlow onBegin={onBegin} />
    </I18nProvider>,
  );
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function root(): HTMLElement {
  if (!mounted) throw new Error('not mounted');
  return mounted.container;
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(root().querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!found) throw new Error(`button not found: ${text}`);
  return found;
}

function nameInput(): HTMLInputElement {
  const input = root().querySelector('input');
  if (!input) throw new Error('name input not found');
  return input;
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function question(): string {
  return root().querySelector('h1')?.textContent ?? '';
}

function art(): string {
  const images = Array.from(root().querySelectorAll('img'));
  return images.map((image) => decodeURIComponent(image.getAttribute('src') ?? '')).join(' ');
}

describe('OnboardingFlow (상태 전환)', () => {
  it('갈래를 건너뛰면 afterLoss 가 되고, 바닥 줄에 그 사실을 미리 적는다', () => {
    click(button(LOCALE_LABELS.ko));
    click(button(ko.onboarding.skip)); // 이름
    expect(question()).toBe(ko.onboarding.askPath(ko.onboarding.defaultPetName));
    expect(root().textContent).toContain(ko.onboarding.pathSkipHint);
    expect(art()).toContain('/hero-');

    click(button(ko.onboarding.skip)); // 갈래
    expect(useOnboardingStore.getState().griefProfile.griefPath).toBe('afterLoss');
    click(button(ko.onboarding.duration['4-7']));
    expect(question()).toBe(ko.onboarding.askLoss(ko.onboarding.defaultPetName));
    expect(art()).toContain('/onboarding-after-');
  });

  it('이름을 비우고 다음(Enter·화살표)을 누르면 건너뛰기와 같다', () => {
    click(button(LOCALE_LABELS.ko));
    typeInto(nameInput(), '   ');
    pressKey(nameInput(), 'Enter');
    const afterEnter = useOnboardingStore.getState();
    expect(afterEnter.stepIndex).toBe(2);
    expect(afterEnter.griefProfile.petName).toBeUndefined();
    expect(question()).toBe(ko.onboarding.askPath(ko.onboarding.defaultPetName));

    // 화살표로도 같다: 처음부터 다시, 빈 칸에서 화살표.
    act(() => useOnboardingStore.getState().reset());
    act(() => useOnboardingStore.getState().start(ko));
    click(button(LOCALE_LABELS.ko));
    click(root().querySelector(`button[aria-label="${ko.onboarding.next}"]`) as Element);
    const afterArrow = useOnboardingStore.getState();
    expect(afterArrow.stepIndex).toBe(2);
    expect(afterArrow.griefProfile).toEqual(afterEnter.griefProfile);
    // 건너뛴 이름은 흔적 배지에 남지 않는다.
    expect(root().textContent).not.toContain(ko.chat.skip);
  });

  it('마무리 요약에 답한 값이 보이고, 시작하면 그 프로필을 넘긴다', () => {
    click(button(LOCALE_LABELS.ko));
    typeInto(nameInput(), PET);
    pressKey(nameInput(), 'Enter');
    click(button(ko.onboarding.path.beforeLoss));
    expect(art()).toContain('/onboarding-before-');
    click(button(ko.onboarding.duration['8-11']));
    expect(question()).toBe(ko.onboarding.askSituation(PET));
    click(button(ko.onboarding.situation.aging));
    click(button(ko.onboarding.sleep.fair));

    expect(question()).toBe(ko.onboarding.closing);
    const summary = root().querySelector('dl');
    const rows = Array.from(summary?.querySelectorAll('div') ?? [], (row) => [
      row.querySelector('dt')?.textContent,
      row.querySelector('dd')?.textContent,
    ]);
    expect(rows).toEqual([
      [ko.onboarding.summary.pet, PET],
      [ko.onboarding.summary.together, ko.onboarding.duration['8-11']],
      [ko.onboarding.summary.now, ko.onboarding.path.beforeLoss],
      [ko.onboarding.summary.chatLanguage, LOCALE_LABELS.ko],
    ]);

    click(button(ko.onboarding.begin));
    expect(onBegin).toHaveBeenCalledWith(
      expect.objectContaining({
        petName: PET,
        griefPath: 'beforeLoss',
        togetherRange: '8-11',
        situation: 'aging',
        preferredLanguage: 'ko',
      }),
    );
  });

  it('건너뛴 칸은 요약에서 비워 두지 않고 나중에 알아간다고 적는다', () => {
    click(button(LOCALE_LABELS.ko));
    for (let index = 0; index < 5; index += 1) click(button(ko.onboarding.skip));
    const values = Array.from(root().querySelectorAll('dl dd'), (cell) => cell.textContent);
    expect(values).toEqual([
      ko.onboarding.summaryUnanswered,
      ko.onboarding.summaryUnanswered,
      ko.onboarding.path.afterLoss,
      LOCALE_LABELS.ko,
    ]);
  });
});
