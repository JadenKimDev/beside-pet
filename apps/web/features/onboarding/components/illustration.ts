import type { GriefPath } from '@/lib/api';
import type { Theme } from '@/theme/config';

// 삽화는 public/illustrations/<테마>/<이름>-<폭>.webp 에 두 크기로 있다(#12 S4). 온보딩은 큰 판을 쓴다.
export type OnboardingArt = 'hero' | 'onboarding-after' | 'onboarding-before';

const LARGE: Record<OnboardingArt, number> = {
  hero: 1600,
  'onboarding-after': 1024,
  'onboarding-before': 1024,
};

export const ONBOARDING_ARTS: OnboardingArt[] = ['hero', 'onboarding-after', 'onboarding-before'];

export const artFor = (path: GriefPath): OnboardingArt =>
  path === 'beforeLoss' ? 'onboarding-before' : 'onboarding-after';

export const artSource = (theme: Theme, art: OnboardingArt, width = LARGE[art]): string =>
  `/illustrations/${theme}/${art}-${width}.webp`;
