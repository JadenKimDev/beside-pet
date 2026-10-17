import type { Theme } from '@/theme/config';

// 목록의 두 카드 삽화. public/illustrations/<테마>/ 의 WebP 두 크기 중에서 고른다.
// 이어지는 대화 카드는 새벽 산책길(onboarding-after), 새 대화 카드는 창가의 방석(hero)이다.
const ART = {
  current: { name: 'onboarding-after', widths: [512, 1024] },
  noOpen: { name: 'hero', widths: [800, 1600] },
} as const;

export type ListArt = keyof typeof ART;

export function listArtSources(theme: Theme, art: ListArt): { src: string; srcSet: string } {
  const { name, widths } = ART[art];
  const [small, large] = widths.map((width) => ({
    width,
    url: `/illustrations/${theme}/${name}-${width}.webp`,
  }));
  return {
    src: small.url,
    srcSet: `${small.url} ${small.width}w, ${large.url} ${large.width}w`,
  };
}
