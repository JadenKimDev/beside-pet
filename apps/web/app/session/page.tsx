'use client';

/**
 * /session — the live conversation.
 * Header: back to the list (the conversation stays open and resumable), the stage and
 * four stepping stones, and "wrap up" (closes it, which may unlock the mind report).
 * Below a crisis reply the crisis card sits in the flow and the composer gives way to
 * the pause notice. Every stage, level and "done" comes from the server via the store.
 */
import Link from 'next/link';
import { useState } from 'react';
import { Composer } from '@/components/chat/Composer';
import { MessageList } from '@/components/chat/MessageList';
import type { Message } from '@/components/chat/types';
import { Button, buttonClass, EmptyState, Icon, IconButton, Modal } from '@/components/ui';
import { CrisisResources } from '@/features/safety/components/CrisisResources';
import { ClosedCard } from '@/features/session/components/ClosedCard';
import { CrisisStopped } from '@/features/session/components/CrisisStopped';
import { SessionHeader } from '@/features/session/components/SessionHeader';
import { useSessionStore } from '@/features/session/session.store';
import { useSessionArchiveStore } from '@/features/session-archive/session-archive.store';
import { useTranslations } from '@/i18n/I18nProvider';

/** The crisis card goes under the last finished reply the server marked level 3. */
function crisisReplyId(messages: Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'bot' && message.supportLevel === 3 && !message.streaming) {
      return message.id;
    }
  }
  return undefined;
}

export default function SessionPage() {
  const translations = useTranslations();
  const sessionId = useSessionStore((state) => state.sessionId);
  const status = useSessionStore((state) => state.status);
  const messages = useSessionStore((state) => state.messages);
  const task = useSessionStore((state) => state.task);
  const streaming = useSessionStore((state) => state.streaming);
  const error = useSessionStore((state) => state.error);
  const reportAvailable = useSessionStore((state) => state.reportAvailable);
  const closing = useSessionStore((state) => state.closing);
  const storedPetName = useSessionStore((state) => state.petName);
  const sendUserMessage = useSessionStore((state) => state.sendUserMessage);
  const resendMessage = useSessionStore((state) => state.resendMessage);
  const wrapUp = useSessionStore((state) => state.wrapUp);
  const listedPetName = useSessionArchiveStore(
    (state) => state.items?.find((item) => item.sessionId === sessionId)?.petName,
  );
  const petName = storedPetName ?? listedPetName;

  const [confirmingEnd, setConfirmingEnd] = useState(false);

  if (status === 'idle') {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<Icon name="chat" />}
          title={translations.session.noSession}
          action={
            <Link href="/sessions" className={buttonClass({ variant: 'primary' })}>
              {translations.session.toList}
            </Link>
          }
        />
      </main>
    );
  }

  if (messages.length === 0 && error && !streaming) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<Icon name="alert" />}
          title={translations.session.startFailed}
          description={translations.session.startFailedBody}
          action={
            <Link href="/sessions" className={buttonClass({ variant: 'primary' })}>
              {translations.session.toList}
            </Link>
          }
        />
      </main>
    );
  }

  const crisisId = crisisReplyId(messages);
  const closed = status === 'closed';

  const onConfirmEnd = async () => {
    try {
      await wrapUp();
      setConfirmingEnd(false);
    } catch {
      // The modal stays open so the person can try again.
    }
  };

  return (
    <main className="flex w-full flex-1 flex-col">
      <SessionHeader
        task={task}
        petName={petName}
        backHref="/sessions"
        actions={
          !closed && !crisisId ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                iconStart={<Icon name="check" />}
                onClick={() => setConfirmingEnd(true)}
                className="max-sm:hidden"
              >
                {translations.session.endConversation}
              </Button>
              <IconButton
                label={translations.session.endConversation}
                icon={<Icon name="check" />}
                onClick={() => setConfirmingEnd(true)}
                className="sm:hidden"
              />
            </>
          ) : undefined
        }
      />

      <MessageList
        messages={messages}
        onResend={(message) => void resendMessage(message.id)}
        after={(message) => (message.id === crisisId ? <CrisisResources /> : undefined)}
        footer={
          closed && !crisisId ? (
            <ClosedCard sessionId={sessionId} reportAvailable={reportAvailable} />
          ) : undefined
        }
      />

      {crisisId ? (
        <CrisisStopped />
      ) : (
        !closed && (
          <Composer
            busy={streaming}
            disabled={closing}
            onSend={(text) => void sendUserMessage(text)}
          />
        )
      )}

      <Modal
        open={confirmingEnd}
        icon={<Icon name="check" />}
        title={translations.session.confirmEndTitle}
        body={translations.session.confirmEndBody}
        cancelLabel={translations.session.cancel}
        confirmLabel={translations.session.confirmEnd}
        busy={closing}
        onCancel={() => setConfirmingEnd(false)}
        onConfirm={() => void onConfirmEnd()}
      />
    </main>
  );
}
