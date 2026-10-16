'use client';

/**
 * /sessions/[id] — one session's transcript.
 * Shows the full conversation record; the mind report lives on its own page
 * (/sessions/[id]/report). An ongoing session offers to re-enter the
 * conversation instead. Loading lives in session-archive.store; this page
 * renders it and owns navigation.
 */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { useSessionStore } from '@/features/session/session.store';
import { useSessionArchiveStore } from '@/features/session-archive/session-archive.store';
import { useTranslations } from '@/i18n/I18nProvider';

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

  useEffect(() => {
    void loadDetail(sessionId);
  }, [sessionId, loadDetail]);

  const onContinue = () => {
    void resumeSession(sessionId);
    router.push('/session');
  };

  if (status === 'failed') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-muted">{translations.loadFailed}</p>
        <Link href="/sessions" className="font-medium text-accent underline">
          {translations.back}
        </Link>
      </main>
    );
  }

  // `loadedId` guards the first render after navigating between sessions.
  if (status !== 'ready' || loadedId !== sessionId || !session || !transcript) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-muted">
        {translations.loading}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      <header className="space-y-3">
        <Link href="/sessions" className="text-sm text-muted underline hover:text-foreground">
          ← {translations.back}
        </Link>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-xl font-semibold tracking-tight">
              {labels.taskLabels[session.task]}
            </h1>
            <p className="text-xs text-muted">{Math.round(session.progress * 100)}%</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              session.closed ? 'bg-black/5 text-muted' : 'bg-accent/10 font-medium text-accent'
            }`}
          >
            {session.closed ? translations.done : translations.ongoing}
          </span>
        </div>
      </header>

      <section className="mt-6 space-y-3">
        {transcript.map((message) => (
          <MessageBubble
            key={`${message.at}-${message.role}`}
            message={{
              id: `${message.at}-${message.role}`,
              role: message.role === 'user' ? 'user' : 'bot',
              text: message.text,
            }}
          />
        ))}
      </section>

      {!session.closed && (
        <div className="mt-8">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-xl bg-accent px-6 py-3 font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            {translations.continueButton}
          </button>
        </div>
      )}
    </main>
  );
}
