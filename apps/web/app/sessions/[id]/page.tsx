'use client';

/**
 * /sessions/[id] — one session's transcript, read again.
 * Same header as the live conversation (progress fixed at the stage reached; on the
 * right the mind report, or "continue" for an open one), same bubbles and stage
 * dividers, no composer. Loading lives in session-archive.store; this page renders
 * it and owns navigation.
 */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { MessageList } from '@/components/chat/MessageList';
import type { Message } from '@/components/chat/types';
import { Button, buttonClass, EmptyState, Icon, Skeleton, SkeletonArea } from '@/components/ui';
import { CrisisResources } from '@/features/safety/components/CrisisResources';
import { SessionHeader } from '@/features/session/components/SessionHeader';
import { useSessionStore } from '@/features/session/session.store';
import { useSessionArchiveStore } from '@/features/session-archive/session-archive.store';
import { useTranslations } from '@/i18n/I18nProvider';
import type { HistoryMessage } from '@/lib/api';

const toMessages = (transcript: HistoryMessage[], crisis: boolean): Message[] => {
  const lastBot = transcript.map((message) => message.role).lastIndexOf('assistant');
  return transcript.map((message, index) => ({
    id: `history-${index}`,
    role: message.role === 'user' ? 'user' : 'bot',
    text: message.text,
    at: message.at,
    task: message.task,
    // The transcript has no per-message level; the session's crisis belongs to its last reply.
    ...(crisis && index === lastBot ? { supportLevel: 3 as const } : {}),
  }));
};

/** Three bubble-shaped bars while the transcript loads. */
function TranscriptSkeleton({ label }: { label: string }) {
  return (
    <SkeletonArea label={label} className="mx-auto grid w-full max-w-read gap-4 px-4 pt-6 pb-8">
      <Skeleton className="h-16 w-[70%] rounded-bubble" />
      <Skeleton className="ml-auto h-12 w-[55%] rounded-bubble" />
      <Skeleton className="h-20 w-[75%] rounded-bubble" />
    </SkeletonArea>
  );
}

export default function SessionDetailPage() {
  const labels = useTranslations();
  const translations = labels.sessionDetail;
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const resumeSession = useSessionStore((state) => state.resumeSession);
  const loadDetail = useSessionArchiveStore((state) => state.loadDetail);
  const status = useSessionArchiveStore((state) => state.detailStatus);
  const loadedId = useSessionArchiveStore((state) => state.detailId);
  const session = useSessionArchiveStore((state) => state.detail);
  const transcript = useSessionArchiveStore((state) => state.transcript);
  const petName = useSessionArchiveStore(
    (state) => state.items?.find((item) => item.sessionId === sessionId)?.petName,
  );

  useEffect(() => {
    void loadDetail(sessionId);
  }, [sessionId, loadDetail]);

  const onContinue = () => {
    void resumeSession(sessionId, petName);
    router.push('/session');
  };

  // `loadedId` guards the first render after navigating between sessions.
  const ready =
    status === 'ready' &&
    loadedId === sessionId &&
    session !== undefined &&
    transcript !== undefined;

  const actions = !ready ? undefined : !session.closed ? (
    <Button size="sm" iconEnd={<Icon name="arrow-right" />} onClick={onContinue}>
      {translations.continueButton}
    </Button>
  ) : session.reportAvailable ? (
    <Link
      href={`/sessions/${sessionId}/report`}
      className={buttonClass({ variant: 'secondary', size: 'sm' })}
    >
      <Icon name="book" />
      {translations.reportTitle}
    </Link>
  ) : (
    <Button
      variant="secondary"
      size="sm"
      iconStart={<Icon name="book" />}
      disabled
      disabledReason={translations.reportNotReady}
    >
      {translations.reportTitle}
    </Button>
  );

  const messages = ready ? toMessages(transcript, session.supportLevel === 3) : [];
  const crisisId = messages.findLast((message) => message.supportLevel === 3)?.id;

  return (
    <main className="flex w-full flex-1 flex-col">
      <SessionHeader
        task={ready ? session.task : 0}
        petName={petName}
        backHref="/sessions"
        actions={actions}
      />
      {status === 'failed' ? (
        <EmptyState
          icon={<Icon name="alert" />}
          title={translations.loadFailed}
          reassurance={translations.loadFailedBody}
          action={
            <Button iconStart={<Icon name="refresh" />} onClick={() => void loadDetail(sessionId)}>
              {labels.common.reload}
            </Button>
          }
        />
      ) : ready ? (
        <MessageList
          messages={messages}
          after={(message) => (message.id === crisisId ? <CrisisResources /> : undefined)}
        />
      ) : (
        <TranscriptSkeleton label={translations.loading} />
      )}
    </main>
  );
}
