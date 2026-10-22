'use client';

/**
 * /sessions/trash — 지운 대화 보관함. 지운 대화는 서버가 3개월 동안 두었다가 기동 때 파기한다(ADR-0036).
 * 카드는 지난 대화 목록과 같은 모양이고, 지운 날짜와 남은 날수, [되살리기]를 둔다.
 * 상태: 불러오는 중(스켈레톤) / 실패(다시 불러오기) / 빈 보관함(목록으로) / 목록.
 * 되살리면 그 카드가 빠지고(스토어가 보관함을 다시 읽는다) 토스트를 보인다. 되살린 대화는 목록으로 돌아간다.
 */
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { Button, buttonClass, EmptyState, Icon, Toast } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import { useSessionArchiveStore } from '../session-archive.store';
import { SessionsSkeleton } from './SessionsSkeleton';
import { TrashItem } from './TrashItem';

type Notice = { kind: 'restored' } | { kind: 'restoreFailed'; sessionId: string };

export function TrashScreen() {
  const t = useTranslations();
  const loadTrash = useSessionArchiveStore((state) => state.loadTrash);
  const restoreSession = useSessionArchiveStore((state) => state.restoreSession);
  const trash = useSessionArchiveStore((state) => state.trash);
  const status = useSessionArchiveStore((state) => state.trashStatus);
  const busy = useSessionArchiveStore((state) => state.busy);

  /** 되살리는 중인 대화. 그 카드의 버튼만 스피너를 돌린다. */
  const [restoring, setRestoring] = useState<string>();
  const [notice, setNotice] = useState<Notice>();

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  const restore = async (sessionId: string) => {
    setRestoring(sessionId);
    try {
      await restoreSession(sessionId);
      setNotice({ kind: 'restored' });
    } catch {
      setNotice({ kind: 'restoreFailed', sessionId });
    } finally {
      setRestoring(undefined);
    }
  };

  const toList = (
    <Link href="/sessions" className={buttonClass({ variant: 'secondary' })}>
      <Icon name="chev-left" />
      {t.sessionTrash.toList}
    </Link>
  );

  let body: ReactNode;
  if (status === 'failed') {
    body = (
      <EmptyState
        icon={<Icon name="refresh" />}
        title={t.sessionTrash.failedTitle}
        description={t.sessionTrash.failedBody}
        action={
          <Button iconStart={<Icon name="refresh" />} onClick={() => void loadTrash()}>
            {t.common.reload}
          </Button>
        }
      />
    );
  } else if (!trash) {
    // 되살린 뒤 다시 읽는 동안에는 지금 목록을 그대로 두고, 처음 읽을 때만 스켈레톤이다.
    body = <SessionsSkeleton label={t.sessionTrash.loading} />;
  } else if (trash.length === 0) {
    body = (
      <EmptyState
        icon={<Icon name="trash" />}
        title={t.sessionTrash.emptyTitle}
        description={t.sessionTrash.emptyBody}
        action={toList}
      />
    );
  } else {
    body = (
      <ul className="m-0 mt-8 grid list-none gap-3 p-0">
        {trash.map((item) => (
          <TrashItem
            key={item.sessionId}
            item={item}
            restoring={restoring === item.sessionId}
            disabled={busy && restoring !== item.sessionId}
            onRestore={() => void restore(item.sessionId)}
          />
        ))}
      </ul>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 px-6 pt-12 pb-20 max-sm:px-4 max-sm:pt-7 max-sm:pb-14">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <Link
            href="/sessions"
            className="inline-flex items-center gap-1 text-small text-fg-muted no-underline hover:text-fg [&_svg]:size-4"
          >
            <Icon name="chev-left" />
            {t.sessionTrash.toList}
          </Link>
          <h1 className="m-0 mt-1.5 font-serif text-display-s font-bold">{t.sessionTrash.title}</h1>
        </div>
        <p className="m-0 max-w-[420px] text-fg-muted">{t.sessionTrash.subtitle}</p>
      </div>

      {body}

      {notice?.kind === 'restored' && (
        <Toast message={t.toast.restored} onDismiss={() => setNotice(undefined)} />
      )}
      {notice?.kind === 'restoreFailed' && (
        <Toast
          tone="error"
          message={t.toast.restoreFailed}
          retryLabel={t.common.retry}
          onRetry={() => {
            setNotice(undefined);
            void restore(notice.sessionId);
          }}
          onDismiss={() => setNotice(undefined)}
        />
      )}
    </main>
  );
}
