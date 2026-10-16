'use client';

import '@/components/ui/illustration-frame.css';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import type { Theme } from '@/theme/config';
import { illustrationSources } from '../illustration';
import { HelpLines } from './HelpLines';

/**
 * 도움받을 수 있는 곳(/help). 공개, 정적: 서버를 부르지 않고 인증 상태를 보지 않는다.
 * 삽화의 테마는 layout 이 읽은 쿠키 값을 page 가 넘긴다(첫 그림부터 맞는 판).
 */
export function HelpScreen({ theme }: { theme: Theme }) {
  const translations = useTranslations();
  const picture = illustrationSources(theme, 'crisis-calm');
  return (
    <main className="mx-auto w-full max-w-read flex-1 px-6 pt-10 pb-20 max-sm:px-4">
      <div className="illust-frame mb-9 h-[260px] max-sm:h-40">
        {/* biome-ignore lint/performance/noImgElement: 삽화는 미리 만든 WebP 두 크기를 srcSet 으로 고른다(최적화기를 거치지 않는다). */}
        <img
          src={picture.src}
          srcSet={picture.srcSet}
          sizes="(max-width: 680px) 100vw, 680px"
          alt=""
          decoding="async"
          className="illust object-[25%_55%]"
        />
      </div>
      <p className="m-0 text-eyebrow font-semibold tracking-[.12em] text-crisis-ink uppercase">
        {translations.help.eyebrow}
      </p>
      <h1 className="m-0 mt-2.5 font-serif text-display-s font-bold">{translations.help.title}</h1>
      <p className="m-0 mt-4 text-lead text-fg-muted">{translations.help.lead}</p>
      <div className="mt-7">
        <HelpLines size="lg" />
      </div>
      <p className="m-0 mt-3.5 text-small font-semibold text-crisis-ink">
        {translations.safety.emergency}
      </p>
      <div className="mt-9 rounded-lg bg-bg-sunk p-6 text-sm leading-[1.8] text-fg-muted">
        {translations.footer.disclaimer}
      </div>
      <p className="m-0 mt-7">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-accent-ink underline underline-offset-[3px] [&_svg]:size-3.5"
        >
          <Icon name="chev-left" />
          {translations.help.toHome}
        </Link>
      </p>
    </main>
  );
}
