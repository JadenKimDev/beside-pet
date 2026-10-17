'use client';

import '@/components/ui/illustration-frame.css';
import '@/components/ui/ui.css';
import '../report.css';
import Link from 'next/link';
import { useEffect } from 'react';
import {
  Button,
  buttonClass,
  EmptyState,
  Icon,
  SKELETON_DELAY_MS,
  Skeleton,
  SkeletonArea,
} from '@/components/ui';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import { useTranslations } from '@/i18n/I18nProvider';
import { reportArt } from '../illustration';
import { useReportStore } from '../report.store';
import { ReportView } from './ReportView';

/**
 * 마음 리포트 한 장: 쓰는 중 / 아직 안 열림 / 실패 / 리포트.
 * 쓰는 중 표시는 `writingDelayMs` 뒤에야 나타난다. 이미 쓴 리포트는 그 안에 와서 깜박이지 않는다.
 */
export function ReportScreen({
  sessionId,
  writingDelayMs = SKELETON_DELAY_MS,
}: {
  sessionId: string;
  writingDelayMs?: number;
}) {
  const t = useTranslations();
  const theme = useDocumentTheme();
  const load = useReportStore((state) => state.load);
  const loadedId = useReportStore((state) => state.sessionId);
  const storedPhase = useReportStore((state) => state.phase);
  const report = useReportStore((state) => state.report);

  useEffect(() => {
    void load(sessionId);
  }, [sessionId, load]);

  // 다른 대화로 옮겨 가는 동안 칸에는 앞의 것이 남아 있다.
  const phase = loadedId === sessionId ? storedPhase : 'loading';

  return (
    <main className="report-page mx-auto w-full max-w-read flex-1 px-4 pt-6 pb-16 sm:px-8">
      {(phase === 'loading' || phase === 'idle') && (
        <SkeletonArea label={t.report.writingTitle} delayMs={writingDelayMs} className="grid gap-4">
          <div className="grid justify-items-center gap-3 py-10 text-center">
            <span className="ui-breathe grid size-16 place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-7">
              <Icon name="book" />
            </span>
            <p className="m-0 font-serif text-h2">{t.report.writingTitle}</p>
            <p className="m-0 max-w-[360px] text-fg-muted">{t.report.writingHint}</p>
          </div>
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </SkeletonArea>
      )}

      {phase === 'notReady' && (
        <EmptyState
          headingLevel={2}
          // biome-ignore lint/performance/noImgElement: 삽화는 미리 만든 WebP 두 크기를 srcSet 으로 고른다.
          art={<img {...reportArt(theme, 'empty-state')} sizes="220px" alt="" />}
          title={t.report.notReadyTitle}
          description={t.report.notReadyBody}
          action={
            <Link href="/sessions" className={buttonClass({ variant: 'secondary' })}>
              {t.report.toList}
            </Link>
          }
        />
      )}

      {phase === 'failed' && (
        <EmptyState
          icon={<Icon name="alert" />}
          title={t.report.failedTitle}
          description={t.report.failedBody}
          action={
            <Button iconStart={<Icon name="refresh" />} onClick={() => void load(sessionId)}>
              {t.report.retry}
            </Button>
          }
        />
      )}

      {phase === 'ready' && report && <ReportView sessionId={sessionId} report={report} />}
    </main>
  );
}
