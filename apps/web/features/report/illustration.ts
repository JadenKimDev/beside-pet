import type { Theme } from '@/theme/config';

// 리포트가 쓰는 삽화 둘. public/illustrations/<테마>/<이름>-<폭>.webp 에 작은 폭과 큰 폭이 있다.
const REPORT_ART = {
  'report-header': { small: 800, large: 1600 },
  'empty-state': { small: 512, large: 1024 },
} as const;

export type ReportArt = keyof typeof REPORT_ART;

export function reportArt(theme: Theme, name: ReportArt): { src: string; srcSet: string } {
  const { small, large } = REPORT_ART[name];
  const file = (width: number) => `/illustrations/${theme}/${name}-${width}.webp`;
  return { src: file(small), srcSet: `${file(small)} ${small}w, ${file(large)} ${large}w` };
}
