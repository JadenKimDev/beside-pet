'use client';

/**
 * /session — the live conversation.
 * The header carries progress plus the two ways out: leaving (the conversation
 * stays open and resumable) and wrapping up (closes it, which unlocks the mind
 * report). Both land on the session list rather than the app root.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Composer } from '@/components/chat/Composer';
import { MessageList } from '@/components/chat/MessageList';
import { CrisisResources } from '@/features/safety/components/CrisisResources';
import { ProgressBar } from '@/features/session/components/ProgressBar';
import { useSessionStore } from '@/features/session/session.store';
import { useSessionArchiveStore } from '@/features/session-archive/session-archive.store';
import { useTranslations } from '@/i18n/I18nProvider';

export default function SessionPage() {
  const translations = useTranslations();
  const router = useRouter();
  const sessionId = useSessionStore((state) => state.sessionId);
  const status = useSessionStore((state) => state.status);
  const messages = useSessionStore((state) => state.messages);
  const task = useSessionStore((state) => state.task);
  const progress = useSessionStore((state) => state.progress);
  const supportLevel = useSessionStore((state) => state.supportLevel);
  const streaming = useSessionStore((state) => state.streaming);
  const sendUserMessage = useSessionStore((state) => state.sendUserMessage);
  const reset = useSessionStore((state) => state.reset);
  const endSession = useSessionArchiveStore((state) => state.endSession);
  const busy = useSessionArchiveStore((state) => state.busy);

  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const leaveToList = () => {
    reset();
    router.push('/sessions');
  };

  const onConfirmEnd = async () => {
    if (sessionId) {
      await endSession(sessionId);
    }
    leaveToList();
  };

  if (status === 'idle') {
    return (
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="space-y-3 text-center">
          <p className="text-muted">{translations.session.noSession}</p>
          <Link href="/sessions" className="inline-block font-medium text-accent underline">
            {translations.session.toList}
          </Link>
        </div>
      </main>
    );
  }

  const closed = status === 'closed';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <ProgressBar task={task} progress={progress} />
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {!closed && (
              <button
                type="button"
                onClick={() => setConfirmingEnd(true)}
                className="text-muted underline hover:text-foreground"
              >
                {translations.session.endConversation}
              </button>
            )}
            <button
              type="button"
              onClick={leaveToList}
              className="text-muted underline hover:text-foreground"
            >
              {translations.session.toList}
            </button>
            <Link href="/settings" className="text-muted underline hover:text-foreground">
              {translations.settings.title}
            </Link>
          </div>
        </div>
      </header>

      <MessageList messages={messages} />

      {supportLevel >= 3 && <CrisisResources />}

      {closed ? (
        <div className="space-y-3 border-t border-black/5 p-4 text-center">
          <p className="text-sm text-muted">{translations.session.closed}</p>
          <button type="button" onClick={leaveToList} className="font-medium text-accent underline">
            {translations.session.toList}
          </button>
        </div>
      ) : (
        <Composer disabled={streaming} onSend={(text) => sendUserMessage(text)} />
      )}

      {confirmingEnd && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{translations.session.confirmEndTitle}</h2>
            <p className="text-sm leading-relaxed text-muted">
              {translations.session.confirmEndBody}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingEnd(false)}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-black/5"
              >
                {translations.session.cancel}
              </button>
              <button
                type="button"
                onClick={() => void onConfirmEnd()}
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {translations.session.confirmEnd}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
