'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { fetchBoard, fetchIssue, type IssueCard } from '@/entities/issue';
import { Button, PageTitle } from '@/shared/ui';
import { useAuthErrorRedirect } from '@/widgets/app-shell';
import { findCard, IssueBoard } from '@/widgets/issue-board';
import { ISSUE_DETAIL_TEXT, IssueDetailPanel } from '@/widgets/issue-detail';
import {
  boardFailed,
  boardStarted,
  boardSucceeded,
  detailFailed,
  detailStarted,
  detailSucceeded,
  INITIAL_BOARD,
  NO_DETAIL,
} from '../model/load';

const DEV_NOTES_TEXT = {
  title: '개발노트',
  description:
    'GitHub 이슈(PRD)와 보드를 봐요. 보드 첫 열의 이슈는 여기서 구현을 시작할 수 있어요.',
  refresh: '새로 받기',
  writePrd: 'PRD 쓰기',
} as const;

export function DevNotesPage() {
  const handleAuthError = useAuthErrorRedirect();
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [detail, setDetail] = useState(NO_DETAIL);
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reloadBoard = useCallback(async () => {
    setBoard(boardStarted);
    try {
      const next = await fetchBoard();
      setBoard((state) => boardSucceeded(state, next));
    } catch (error: unknown) {
      if (!handleAuthError(error)) setBoard((state) => boardFailed(state, error));
    }
  }, [handleAuthError]);

  const loadDetail = useCallback(
    async (number: number) => {
      setDetail((state) => detailStarted(state, number));
      try {
        const next = await fetchIssue(number);
        setDetail((state) => detailSucceeded(state, number, next));
      } catch (error: unknown) {
        if (!handleAuthError(error)) setDetail((state) => detailFailed(state, number, error));
      }
    },
    [handleAuthError],
  );

  useEffect(() => {
    void reloadBoard();
  }, [reloadBoard]);

  useEffect(() => {
    if (selected !== null) void loadDetail(selected);
  }, [selected, loadDetail]);

  function select(card: IssueCard) {
    setNotice(null);
    setActionError(null);
    setSelected(card.number);
  }

  function close() {
    setSelected(null);
    setDetail(NO_DETAIL);
    setNotice(null);
    setActionError(null);
  }

  function started() {
    setActionError(null);
    setNotice(ISSUE_DETAIL_TEXT.started);
    void reloadBoard();
    if (selected !== null) void loadDetail(selected);
  }

  return (
    <>
      <PageTitle
        title={DEV_NOTES_TEXT.title}
        description={DEV_NOTES_TEXT.description}
        actions={
          <>
            {board.failure !== 'tokenMissing' && (
              <Button
                variant="secondary"
                size="sm"
                busy={board.loading}
                onClick={() => void reloadBoard()}
              >
                {DEV_NOTES_TEXT.refresh}
              </Button>
            )}
            <Link
              href="/dev-notes/new"
              className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium whitespace-nowrap text-accent-fg hover:opacity-90"
            >
              {DEV_NOTES_TEXT.writePrd}
            </Link>
          </>
        }
      />
      <IssueBoard
        board={board.board}
        failure={board.failure}
        selected={selected}
        onSelect={select}
        onRetry={() => void reloadBoard()}
      />
      <IssueDetailPanel
        card={findCard(board.board, selected)}
        firstColumn={board.board?.columns[0] ?? null}
        detail={detail.detail}
        failure={detail.failure}
        notice={notice}
        actionError={actionError}
        onClose={close}
        onRetry={() => selected !== null && void loadDetail(selected)}
        onStarted={started}
        onActionError={(message) => {
          setNotice(null);
          setActionError(message);
        }}
      />
    </>
  );
}
