import type { GriefPath } from '@/lib/api';
import type { Theme } from '@/theme/config';

// 삽화는 public/illustrations/<테마>/<이름>-<폭>.webp 에 두 크기로 있다(#12 S4).
// 온보딩은 넓은 폭에서 큰 판을, 좁은 폭(위 180px 띠)에서 작은 판을 쓴다(#25).
export type OnboardingArt = 'hero' | 'onboarding-after' | 'onboarding-before';

const WIDTHS: Record<OnboardingArt, { narrow: number; wide: number }> = {
  hero: { narrow: 800, wide: 1600 },
  'onboarding-after': { narrow: 512, wide: 1024 },
  'onboarding-before': { narrow: 512, wide: 1024 },
};

/** 좁은 폭의 기준. 온보딩 레이아웃의 `max-sm:`(Tailwind sm = 640px) 과 같다. */
export const NARROW_MEDIA = '(max-width: 640px)';

export const ONBOARDING_ARTS: OnboardingArt[] = ['hero', 'onboarding-after', 'onboarding-before'];

export const artFor = (path: GriefPath): OnboardingArt =>
  path === 'beforeLoss' ? 'onboarding-before' : 'onboarding-after';

export const artSource = (theme: Theme, art: OnboardingArt, width = WIDTHS[art].wide): string =>
  `/illustrations/${theme}/${art}-${width}.webp`;

/** 한 삽화의 좁은 폭용(작은 판)과 넓은 폭용(큰 판) 원본. */
export const artSources = (theme: Theme, art: OnboardingArt): { narrow: string; wide: string } => ({
  narrow: artSource(theme, art, WIDTHS[art].narrow),
  wide: artSource(theme, art, WIDTHS[art].wide),
});
