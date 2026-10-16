'use client';

import '@/components/ui/illustration-frame.css';
import '@/components/ui/ui.css';
import { useEffect, useId, useRef } from 'react';
import { useTranslations } from '@/i18n/I18nProvider';
import { illustrationSources } from '../illustration';
import { useDocumentTheme } from '../use-document-theme';
import { HelpLines } from './HelpLines';

/**
 * 위기 카드 — supportLevel 3 인 턴의 고정 답 바로 아래, 대화 흐름 안에 붙는다(덮지 않는다).
 * 번호와 문구는 고정이고 모델이 쓰지 않는다(ADR-0004). 색은 crisis 토큰뿐이고 빨강을 쓰지 않는다.
 * 나타나면 포커스를 제목으로 옮겨 스크린리더가 바로 읽게 한다. 늘 무료이고 어떤 벽 뒤에도 두지 않는다.
 */
export function CrisisResources() {
  const translations = useTranslations();
  const theme = useDocumentTheme();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const picture = illustrationSources(theme, 'crisis-calm');

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className="ui-rise mx-4 mb-2 grid grid-cols-[148px_1fr] overflow-hidden rounded-lg border border-crisis-border bg-crisis-bg text-crisis-fg [animation-duration:var(--t-slow)] max-sm:grid-cols-1"
    >
      <div className="illust-frame rounded-none! max-sm:h-[120px]">
        {/* biome-ignore lint/performance/noImgElement: 삽화는 미리 만든 WebP 두 크기를 srcSet 으로 고른다(최적화기를 거치지 않는다). */}
        <img
          src={picture.src}
          srcSet={picture.srcSet}
          sizes="(max-width: 640px) 100vw, 148px"
          alt=""
          loading="lazy"
          decoding="async"
          className="illust object-[25%_55%]"
        />
      </div>
      <div className="grid gap-3 p-6 max-sm:p-5">
        <h3
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="m-0 text-[17px] leading-normal font-bold focus:outline-none"
        >
          {translations.crisis.title}
        </h3>
        <p className="m-0 text-sm leading-relaxed">{translations.crisis.lead}</p>
        <HelpLines />
        <p className="m-0 text-small font-semibold">{translations.safety.emergency}</p>
      </div>
    </div>
  );
}
