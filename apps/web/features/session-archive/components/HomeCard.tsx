'use client';

import '@/components/ui/illustration-frame.css';
import type { ReactNode } from 'react';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import { type ListArt, listArtSources } from '../list-art';

/**
 * 목록 맨 위의 큰 카드(이어지는 대화, 또는 새 대화). 왼쪽 글, 오른쪽 300px 삽화.
 * 760px 이하는 삽화가 위의 150px 띠로 올라가고 버튼은 반씩 나눈다.
 */
export function HomeCard({ art, children }: { art: ListArt; children: ReactNode }) {
  const picture = listArtSources(useDocumentTheme(), art);
  return (
    <section className="mt-8 grid grid-cols-[1fr_300px] overflow-hidden rounded-xl border border-border bg-surface shadow-1 max-[760px]:grid-cols-1">
      <div className="grid content-start gap-[18px] p-8 max-[760px]:px-5 max-[760px]:py-[22px]">
        {children}
      </div>
      <div className="illust-frame rounded-none max-[760px]:order-first max-[760px]:h-[150px]">
        {/* biome-ignore lint/performance/noImgElement: 삽화는 미리 만든 WebP 두 크기를 srcSet 으로 고른다(최적화기를 거치지 않는다). */}
        <img
          src={picture.src}
          srcSet={picture.srcSet}
          sizes="(max-width: 760px) 100vw, 300px"
          alt=""
          decoding="async"
          className="illust"
        />
      </div>
    </section>
  );
}

/** 카드 아래의 행동 줄. 좁은 화면에서는 버튼이 줄을 고르게 나눠 갖는다. */
export function HomeCardActions({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 flex flex-wrap gap-2.5 max-[760px]:[&>*]:flex-1">{children}</div>;
}
