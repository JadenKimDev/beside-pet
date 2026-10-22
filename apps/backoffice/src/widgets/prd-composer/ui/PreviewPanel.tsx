import type { ReactNode } from 'react';
import type { PublishPrdData } from '@/features/publish-prd';
import { Alert, Button, EmptyState, Skeleton } from '@/shared/ui';
import { PRD_COMPOSER_TEXT as T } from '../model/texts';
import { PublishLog } from './PublishLog';

export type PreviewKind = 'empty' | 'loading' | 'ready' | 'failed';

export type PreviewPanelProps = {
  kind: PreviewKind;
  /** 미리보기 중인 파일 이름(basename). */
  file: string | null;
  /** 갱신 시각(이미 글로 바꾼 것). */
  updatedText: string | null;
  /** 다시 읽기가 실패했다. 본문이 있으면 본문 위에 알린다. */
  failed: boolean;
  /** 렌더한 초안 본문. */
  preview: ReactNode;
  onRetry: () => void;
  publish: PublishPrdData;
  /** 올리기를 받을 수 없을 때(답이 흐르는 중 등) true. */
  publishDisabled: boolean;
  onPublish: () => void;
  backHref: string;
};

function Body({ kind, preview, onRetry }: Pick<PreviewPanelProps, 'kind' | 'preview' | 'onRetry'>) {
  if (kind === 'ready') return <>{preview}</>;
  if (kind === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{T.previewLoading}</span>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Alert tone="danger">{T.previewFailed}</Alert>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {T.previewRetry}
        </Button>
      </div>
    );
  }
  return <EmptyState title={T.previewEmpty} description={T.previewEmptyHint} />;
}

export function PreviewPanel({
  kind,
  file,
  updatedText,
  failed,
  preview,
  onRetry,
  publish,
  publishDisabled,
  onPublish,
  backHref,
}: PreviewPanelProps) {
  const ready = kind === 'ready';
  const running = publish.status === 'running';
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-surface md:h-[calc(100vh-12rem)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{T.previewTitle}</h2>
          {ready && file && (
            <p className="truncate font-mono text-xs text-fg-muted">
              {file}
              {updatedText && ` · ${T.updatedAt} ${updatedText}`}
            </p>
          )}
        </div>
        {ready && (
          <Button
            size="sm"
            busy={running}
            disabled={publishDisabled || publish.status === 'done'}
            onClick={onPublish}
          >
            {T.publish}
          </Button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        {ready && failed && <Alert tone="danger">{T.previewFailed}</Alert>}
        <PublishLog publish={publish} backHref={backHref} />
        <div className="min-w-0">
          <Body kind={kind} preview={preview} onRetry={onRetry} />
        </div>
      </div>
    </section>
  );
}
