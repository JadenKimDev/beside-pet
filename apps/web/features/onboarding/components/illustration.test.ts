import { describe, expect, it } from 'vitest';
import { artSources, NARROW_MEDIA, ONBOARDING_ARTS } from './illustration';

describe('온보딩 삽화 원본 고르기', () => {
  it('좁은 폭(≤640)에서는 작은 원본, 넓은 폭에서는 큰 원본을 고른다', () => {
    expect(artSources('hanji', 'hero')).toEqual({
      narrow: '/illustrations/hanji/hero-800.webp',
      wide: '/illustrations/hanji/hero-1600.webp',
    });
    expect(artSources('night', 'onboarding-after')).toEqual({
      narrow: '/illustrations/night/onboarding-after-512.webp',
      wide: '/illustrations/night/onboarding-after-1024.webp',
    });
    expect(artSources('ink', 'onboarding-before')).toEqual({
      narrow: '/illustrations/ink/onboarding-before-512.webp',
      wide: '/illustrations/ink/onboarding-before-1024.webp',
    });
  });

  it('모든 삽화가 좁은 원본과 넓은 원본을 따로 갖는다', () => {
    for (const art of ONBOARDING_ARTS) {
      const { narrow, wide } = artSources('hanji', art);
      expect(narrow).not.toBe(wide);
    }
  });

  it('좁은 폭의 기준은 레이아웃의 max-sm 과 같은 640px 이다', () => {
    expect(NARROW_MEDIA).toBe('(max-width: 640px)');
  });
});
