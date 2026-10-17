'use client';

/**
 * 첫 화면의 히어로: 왼쪽 글(눈썹, 명조 제목, 소개, 약속 문장 셋)과 오른쪽 카드(`card`).
 * 삽화는 현재 테마의 hero 를 뒤에 깔고, 데스크톱에서는 왼쪽으로 갈수록 바탕색으로 흐려진다.
 * 모바일(≤640)에서는 삽화가 위 240px 띠로 올라간다. 약속 문장에는 링크를 걸지 않는다(ADR-0012).
 */
import '@/components/ui/illustration-frame.css';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import { useTranslations } from '@/i18n/I18nProvider';

const TRUST_ICONS: readonly IconName[] = ['lock', 'trash', 'lifebuoy'];

export function LandingHero({ card }: { card: ReactNode }) {
  const t = useTranslations().landing;
  const theme = useDocumentTheme();
  const [firstLine, ...restLines] = t.heroTitle.split('\n');

  return (
    <section className="relative pt-10 pb-[72px] max-sm:pt-0 max-sm:pb-12">
      {/* 틀(.illust-frame)은 position: relative 를 가지므로 자리 잡기는 바깥 칸이 맡는다. */}
      <div className="absolute inset-x-0 top-0 z-0 h-[560px] max-sm:relative max-sm:h-60">
        <div className="illust-frame h-full rounded-none!">
          <Image
            src={`/illustrations/${theme}/hero-1600.webp`}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_60%] opacity-85 max-sm:opacity-90"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[image:var(--img-fade),linear-gradient(90deg,var(--color-bg)_0%,color-mix(in_srgb,var(--color-bg)_55%,transparent)_42%,transparent_70%)] max-sm:bg-[image:var(--img-fade)]"
          />
        </div>
      </div>

      <div className="relative z-[1] mx-auto grid w-full max-w-wide grid-cols-[1.1fr_.9fr] items-center gap-14 px-8 max-lg:grid-cols-1 max-lg:gap-7 max-sm:-mt-6 max-sm:px-4">
        <div className="min-w-0">
          <span className="text-eyebrow font-semibold text-accent-ink uppercase">{t.eyebrow}</span>
          <h1 className="mt-4 mb-0 text-display font-bold tracking-[-0.01em] max-sm:text-[34px]">
            {firstLine}
            {restLines.map((line) => (
              <span key={line}>
                <br />
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-5 mb-0 max-w-[30em] text-lead text-fg-muted">{t.heroLead}</p>
          <ul className="mt-7 mb-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[13px] text-fg-muted">
            {t.trust.map((line, index) => (
              <li key={line} className="inline-flex items-center gap-1.5">
                <span className="text-accent-ink [&_svg]:size-4">
                  <Icon name={TRUST_ICONS[index] ?? 'check'} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        {card}
      </div>
    </section>
  );
}
