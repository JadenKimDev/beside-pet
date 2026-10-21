'use client';

import { groupByColumn } from '@/entities/board';
import type { BoardResponse, IssueCard } from '@/entities/issue';
import { Alert, Badge, Button, EmptyState, Skeleton } from '@/shared/ui';
import { type BoardFailure, boardScreen, groupTitle, ISSUE_BOARD_TEXT as T } from '../model/board';
import { IssueCardButton } from './IssueCardButton';

export type IssueBoardProps = {
  /** 받은 보드. 처음 받기 전에는 null 이고 자리 블록을 보인다. */
  board: BoardResponse | null;
  failure: BoardFailure | null;
  selected: number | null;
  onSelect: (card: IssueCard) => void;
  onRetry: () => void;
};

const COLUMNS = 'grid gap-4 md:grid-cols-2 xl:grid-cols-4';

function LoadingBoard() {
  return (
    <div role="status" className={COLUMNS}>
      <span className="sr-only">{T.loading}</span>
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="flex flex-col gap-2 rounded-lg bg-bg-sunk p-3">
          <Skeleton className="h-5 w-24 bg-border" />
          <Skeleton className="h-24 bg-surface" />
          <Skeleton className="h-24 bg-surface" />
        </div>
      ))}
    </div>
  );
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Alert tone="danger">{message}</Alert>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {T.retry}
      </Button>
    </div>
  );
}

/** 보드의 열(Backlog, In progress, In review, Done, 그 뒤 알 수 없는 열과 보드 밖)별 카드. 받기는 views 가 한다. */
export function IssueBoard({ board, failure, selected, onSelect, onRetry }: IssueBoardProps) {
  const { view, staleFailure } = boardScreen(board, failure);

  if (view === 'loading') return <LoadingBoard />;
  if (view === 'tokenMissing')
    return (
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState title={T.tokenMissing} description={T.tokenMissingHint} />
      </div>
    );
  if (view === 'failed' || board === null) return <Retry message={T.failed} onRetry={onRetry} />;
  if (view === 'empty') return <EmptyState title={T.empty} description={T.emptyHint} />;

  return (
    <div className="flex flex-col gap-4">
      {staleFailure && <Retry message={T.staleFailed} onRetry={onRetry} />}
      <div aria-label={T.label} className={COLUMNS}>
        {groupByColumn(board).map((group) => {
          const title = groupTitle(group);
          return (
            <section
              key={`${group.kind}:${title}`}
              aria-label={title}
              className="flex min-w-0 flex-col gap-2 rounded-lg bg-bg-sunk p-3"
            >
              <header className="flex items-center justify-between gap-2 px-1">
                <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
                <Badge>{T.count(group.cards.length)}</Badge>
              </header>
              {group.cards.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-fg-muted">{T.emptyColumn}</p>
              ) : (
                <ul className="flex flex-col gap-2 xl:max-h-[70vh] xl:overflow-y-auto">
                  {group.cards.map((card) => (
                    <li key={card.number}>
                      <IssueCardButton
                        card={card}
                        selected={card.number === selected}
                        onSelect={onSelect}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
