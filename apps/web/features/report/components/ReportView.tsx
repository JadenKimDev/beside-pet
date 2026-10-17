'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Button, buttonClass, Card, type CardVariant, Icon, type IconName } from '@/components/ui';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import type { MindReport, ReportSectionKey } from '@/lib/api';
import { reportArt } from '../illustration';
import { ReportSteps } from './ReportSteps';

/** 구역마다 그릇이 다르다(§7.5). emotions 는 본문 아래 감정 낱말 칩을 둔다(옛 리포트는 `tags` 가 없어 생략). */
const VESSEL: Record<ReportSectionKey, { variant: CardVariant; icon: IconName }> = {
  journey: { variant: 'default', icon: 'paw' },
  emotions: { variant: 'default', icon: 'heart' },
  keepsake: { variant: 'keepsake', icon: 'sparkle' },
  encouragement: { variant: 'sunk', icon: 'leaf' },
};

/** 도달한 걸음(1..4). 마무리(5)는 네 걸음을 다 걸은 것이다. */
const reachedStep = (task: number): number => Math.min(Math.max(Math.floor(task), 1), 4);

export function ReportView({ sessionId, report }: { sessionId: string; report: MindReport }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const theme = useDocumentTheme();
  const cover = reportArt(theme, 'report-header');
  const reached = reachedStep(report.reachedTask);
  // 표지 날짜는 리포트를 쓴 날(`at`)이 아니라 대화를 시작한 날이다.
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(report.startedAt),
  );

  return (
    <article>
      <div className="illust-frame report-cover h-[380px] rounded-b-none! max-sm:h-[220px]">
        {/* biome-ignore lint/performance/noImgElement: 삽화는 미리 만든 WebP 두 크기를 srcSet 으로 고른다(최적화기를 거치지 않는다). */}
        <img src={cover.src} srcSet={cover.srcSet} sizes="(max-width: 680px) 100vw, 680px" alt="" />
      </div>

      <header className="relative -mt-16 grid justify-items-center gap-3 text-center">
        <p className="m-0 text-eyebrow font-semibold tracking-[.12em] text-accent-ink uppercase">
          {t.report.eyebrow}
        </p>
        <h1 className="m-0 font-serif text-display text-balance">
          {t.report.title(report.petName)}
        </h1>
        <p className="m-0 text-small text-fg-muted">
          {t.report.meta(date, t.report.reachedStep[reached - 1])}
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-[440px]">
        <ReportSteps reached={reached} names={t.report.stepsShort} label={t.report.stepsLabel} />
      </div>

      <div className="mt-10 grid gap-4">
        {report.sections.map((section, index) => {
          const vessel = VESSEL[section.key];
          return (
            <Card
              key={section.key}
              as="section"
              variant={vessel.variant}
              data-section={section.key}
              style={{ '--i': index } as CSSProperties}
              className="report-section report-rise grid gap-3"
            >
              <h2 className="m-0 flex items-center gap-2 font-sans text-h3 text-accent-ink [&_svg]:size-5">
                <Icon name={vessel.icon} />
                {t.reportSections[section.key]}
              </h2>
              {section.key === 'keepsake' ? (
                <blockquote className="m-0 font-serif text-[22px] leading-[1.6] whitespace-pre-line max-sm:text-[19px]">
                  {section.body}
                </blockquote>
              ) : (
                <p className="m-0 text-body-l whitespace-pre-line">{section.body}</p>
              )}
              {section.key === 'emotions' && section.tags && section.tags.length > 0 && (
                <ul data-emotion-tags className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {section.tags.map((tag) => (
                    <li
                      key={tag}
                      data-emotion-tag
                      className="rounded-pill border border-border bg-accent-soft px-3.5 py-1 text-small font-semibold text-accent-ink"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
              {section.key === 'encouragement' && (
                <p className="m-0 justify-self-end font-serif text-fg-muted">
                  {t.report.signature}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="report-actions mt-10 flex flex-wrap justify-center gap-3">
        <Link href={`/sessions/${sessionId}`} className={buttonClass({ variant: 'secondary' })}>
          <Icon name="chat" />
          {t.report.revisit}
        </Link>
        <Button
          variant="secondary"
          iconStart={<Icon name="print" />}
          onClick={() => window.print()}
        >
          {t.report.print}
        </Button>
        <Link href="/sessions" className={buttonClass({ variant: 'ghost' })}>
          {t.report.toList}
        </Link>
      </div>
      <p className="mx-auto mt-6 max-w-[440px] text-center text-small text-fg-muted">
        {t.report.writeOnce}
      </p>
    </article>
  );
}
