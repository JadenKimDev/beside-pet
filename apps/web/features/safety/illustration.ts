import type { Theme } from '@/theme/config';

// 삽화는 public/illustrations/<테마>/<이름>-<폭>.webp 에 두 크기로 있다(S4).
export type IllustrationName = 'crisis-calm';

const WIDTHS: Record<IllustrationName, [small: number, large: number]> = {
  'crisis-calm': [512, 1024],
};

export function illustrationSources(theme: Theme, name: IllustrationName) {
  const [small, large] = WIDTHS[name];
  const path = (width: number) => `/illustrations/${theme}/${name}-${width}.webp`;
  return {
    src: path(small),
    srcSet: `${path(small)} ${small}w, ${path(large)} ${large}w`,
  };
}
