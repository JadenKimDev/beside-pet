'use client';

import { useEffect, useRef } from 'react';
import {
  ISSUE_STATE_LABELS,
  ISSUE_STATE_TONES,
  type IssueCard,
  type IssueDetail,
  type IssueLabel,
} from '@/entities/issue';
import { StartImplementationButton } from '@/features/start-implementation';
import { Alert, Badge, Button, Skeleton } from '@/shared/ui';
import { dateTimeText, startableIssue, ISSUE_DETAIL_TEXT as T } from '../model/detail';
import { IssueComments } from './IssueComments';
import { IssueMarkdown } from './IssueMarkdown';

export type IssueDetailFailure = 'tokenMissing' | 'failed';

export type IssueDetailPanelProps = {
  /** 고른 보드 카드. null 이면 닫힌다. 상세가 오기 전에는 카드의 제목과 라벨을 보인다. */
  card: IssueCard | null;
  /** 보드의 첫 열 이름(`board.columns[0] ?? null`). "구현 시작"은 이 열의 이슈에만 보인다. */
  firstColumn: string | null;
  detail: IssueDetail | null;
  failure: IssueDetailFailure | null;
  /** "구현 시작" 뒤의 알림과 실패 문구. views 가 정한다. */
  notice: string | null;
  actionError: string | null;
  onClose: () => void;
  onRetry: () => void;
  onStarted: (labels: IssueLabel[]) => void;
  onActionError: (message: string) => void;
};

function Labels({ labels }: { labels: readonly IssueLabel[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <li key={label.name}>
          <Badge>
            <span
              aria-hidden
              className="mr-1 size-2 rounded-full border border-border-strong"
              style={
                /^[0-9a-f]{6}$/i.test(label.color)
                  ? { backgroundColor: `#${label.color}` }
                  : undefined
              }
            />
            {label.name}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function LoadingBody() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{T.loading}</span>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** 오른쪽에서 열리는 이슈 상세(네이티브 <dialog>). Esc, 바깥 누르기, 닫기 버튼으로 닫는다. */
export function IssueDetailPanel({
  card,
  firstColumn,
  detail,
  failure,
  notice,
  actionError,
  onClose,
  onRetry,
  onStarted,
  onActionError,
}: IssueDetailPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = card !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const shown = detail !== null && card !== null && detail.number === card.number ? detail : null;
  const state = shown?.state ?? card?.state;
  const labels = shown?.labels ?? card?.labels ?? [];

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 바깥(backdrop) 누르기만 받는다. 키보드는 dialog 의 Esc 와 닫기 버튼으로 닫는다.
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="issue-detail-title"
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-3xl border-l border-border bg-surface p-0 text-fg"
    >
      {card && (
        <div className="flex h-full flex-col">
          <header className="flex flex-col gap-3 border-b border-border px-4 py-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-fg-muted">#{card.number}</span>
                {state && (
                  <Badge tone={ISSUE_STATE_TONES[state]}>{ISSUE_STATE_LABELS[state]}</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {T.close}
              </Button>
            </div>
            <h2 id="issue-detail-title" className="text-lg font-semibold break-words">
              {shown?.title ?? card.title}
            </h2>
            {labels.length > 0 && <Labels labels={labels} />}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <StartImplementationButton
                key={card.number}
                issue={startableIssue(card, shown)}
                firstColumn={firstColumn}
                label={T.start}
                onStarted={onStarted}
                onError={onActionError}
              />
              <a
                href={shown?.url ?? card.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent underline"
              >
                {T.openOnGitHub}
              </a>
              {shown && (
                <span className="text-xs text-fg-muted">
                  {T.created(dateTimeText(shown.createdAt))} ·{' '}
                  {T.updated(dateTimeText(shown.updatedAt))}
                </span>
              )}
            </div>
            {notice && <Alert tone="info">{notice}</Alert>}
            {actionError && <Alert tone="danger">{actionError}</Alert>}
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            {failure && !shown ? (
              <div className="flex flex-col items-start gap-2">
                <Alert tone="danger">
                  {failure === 'tokenMissing' ? T.tokenMissing : T.failed}
                </Alert>
                {failure === 'failed' && (
                  <Button variant="secondary" size="sm" onClick={onRetry}>
                    {T.retry}
                  </Button>
                )}
              </div>
            ) : shown ? (
              <div className="flex flex-col gap-8">
                {shown.body.trim() ? (
                  <IssueMarkdown text={shown.body} />
                ) : (
                  <p className="text-sm text-fg-muted">{T.emptyBody}</p>
                )}
                <IssueComments comments={shown.comments} />
              </div>
            ) : (
              <LoadingBody />
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
