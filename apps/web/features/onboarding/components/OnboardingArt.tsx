'use client';

import '@/components/ui/illustration-frame.css';
import { getImageProps } from 'next/image';
import { cx } from '@/components/ui';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import {
  type OnboardingArt as Art,
  artSources,
  NARROW_MEDIA,
  ONBOARDING_ARTS,
} from './illustration';

/**
 * 왼쪽 삽화 패널. 세 그림을 겹쳐 두고 지금 것만 보이게 해 420ms 로 교차 페이드한다.
 * 삽화는 장식이라 alt="" 이고, 뜻을 전하는 안내 글은 이미지 밖(아래 반투명 띠)에 둔다.
 * 모바일(≤640)은 위 180px 띠가 되고 안내 글은 감춘다. 이때는 작은 원본을 고른다(<picture>).
 */
export function OnboardingArt({ art, caption }: { art: Art; caption: string }) {
  const theme = useDocumentTheme();
  return (
    <div className="illust-frame my-4 ml-4 max-sm:mx-4 max-sm:mt-4 max-sm:mb-0 max-sm:h-[180px]">
      {ONBOARDING_ARTS.map((name) => {
        const sources = artSources(theme, name);
        const common = { alt: '', fill: true, priority: name === 'hero' } as const;
        const {
          props: { srcSet: narrowSrcSet },
        } = getImageProps({ ...common, src: sources.narrow, sizes: '100vw' });
        const { props } = getImageProps({ ...common, src: sources.wide, sizes: '45vw' });
        return (
          <picture key={name}>
            <source media={NARROW_MEDIA} srcSet={narrowSrcSet} sizes="100vw" />
            <img
              {...props}
              alt=""
              data-art={name}
              className={cx(
                'transition-opacity duration-(--t-slow) ease-soft',
                name === art ? 'opacity-100' : 'opacity-0',
              )}
            />
          </picture>
        );
      })}
      <p className="absolute inset-x-6 bottom-6 m-0 rounded-md bg-[color-mix(in_srgb,var(--color-surface)_72%,transparent)] px-[18px] py-3.5 text-sm leading-relaxed text-fg backdrop-blur-[6px] max-sm:hidden">
        {caption}
      </p>
    </div>
  );
}
