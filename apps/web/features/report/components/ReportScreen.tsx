'use client';

import '@/components/ui/illustration-frame.css';
import '@/components/ui/ui.css';
import '../report.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Button,
  buttonClass,
  EmptyState,
  Icon,
  Modal,
  SKELETON_DELAY_MS,
  Skeleton,
  SkeletonArea,
  Toast,
} from '@/components/ui';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import { useTranslations } from '@/i18n/I18nProvider';
import { reportArt } from '../illustration';
import { useReportStore } from '../report.store';
import { ReportView } from './ReportView';

/**
 * 마음 리포트 한 장: 쓰는 중 / 아직 안 열림 / 실패 / 짧아서 쓰지 않음 / 리포트.
 * 쓰는 중 표시는 `writingDelayMs` 뒤에야 나타난다. 이미 쓴 리포트는 그 안에 와서 깜박이지 않는다.
 *
 * "리포트 지우기"는 확인창을 거쳐 지우고 목록으로 간다. 지웠다는 알림은 목록이 `?notice=` 로 받아 띄운다.
 * 목록에서 리포트를 되살려 온 경우의 알림은 이 화면이 같은 식으로 받는다.
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
  const remove = useReportStore((state) => state.remove);
  const deleting = useReportStore((state) => state.deleting);
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<'restored' | 'deleteFailed'>();

  // 목록의 더보기 메뉴에서 되살려 온 경우. 새로 고쳐도 다시 뜨지 않게 주소에서 지운다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('notice') !== 'reportRestored') return;
    setNotice('restored');
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const onConfirmDelete = async () => {
    try {
      await remove(sessionId);
      router.push('/sessions?notice=reportDeleted');
    } catch {
      setConfirming(false);
      setNotice('deleteFailed');
    }
  };

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

      {phase === 'empty' && (
        <EmptyState
          headingLevel={2}
          // biome-ignore lint/performance/noImgElement: 삽화는 미리 만든 WebP 두 크기를 srcSet 으로 고른다.
          art={<img {...reportArt(theme, 'empty-state')} sizes="220px" alt="" />}
          title={t.report.emptyTitle}
          description={t.report.emptyBody}
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

      {phase === 'ready' && report && (
        <ReportView sessionId={sessionId} report={report} onDelete={() => setConfirming(true)} />
      )}

      <Modal
        open={confirming}
        tone="danger"
        icon={<Icon name="trash" />}
        title={t.report.confirmDeleteTitle}
        body={t.report.confirmDeleteBody}
        cancelLabel={t.report.cancel}
        confirmLabel={t.report.confirmDelete}
        busy={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void onConfirmDelete()}
      />

      {notice === 'restored' && (
        <Toast message={t.toast.reportRestored} onDismiss={() => setNotice(undefined)} />
      )}
      {notice === 'deleteFailed' && (
        <Toast
          tone="error"
          message={t.toast.reportDeleteFailed}
          retryLabel={t.common.retry}
          onRetry={() => {
            setNotice(undefined);
            setConfirming(true);
          }}
          onDismiss={() => setNotice(undefined)}
        />
      )}
    </main>
  );
}
