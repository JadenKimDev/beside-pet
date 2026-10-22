'use client';

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { PrdChatMessage, PrdChatStatus } from '@/features/prd-chat';
import { Alert, Button } from '@/shared/ui';
import { isSendKey } from '../model/keys';
import { PRD_COMPOSER_TEXT as T } from '../model/texts';
import { toolLine } from '../model/tools';

export type ChatPanelProps = {
  messages: readonly PrdChatMessage[];
  status: PrdChatStatus;
  error: string | null;
  /** 보낸다. 서버가 받지 않았으면 false 이고, 입력 칸에 글을 되돌린다. */
  onSend: (text: string) => Promise<boolean>;
  onReset: () => void;
};

function Message({ message }: { message: PrdChatMessage }) {
  const mine = message.role === 'user';
  return (
    <li className={mine ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
      <span className="mb-1 text-xs text-fg-muted">{mine ? T.you : T.assistant}</span>
      {message.tools && message.tools.length > 0 && (
        <ul className="mb-1 flex max-w-full flex-col gap-0.5 text-xs text-fg-muted">
          {message.tools.map((tool, index) => (
            // 같은 도구가 같은 파일을 두 번 쓸 수 있어 순번을 함께 쓴다.
            // biome-ignore lint/suspicious/noArrayIndexKey: 목록은 붙기만 하고 순서가 바뀌지 않는다.
            <li key={index} className="font-mono break-all">
              {toolLine(tool)}
            </li>
          ))}
        </ul>
      )}
      {message.text && (
        <div
          className={
            mine
              ? 'max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm whitespace-pre-wrap break-words text-accent-fg'
              : 'max-w-[85%] rounded-lg bg-bg-sunk px-3 py-2 text-sm whitespace-pre-wrap break-words text-fg'
          }
        >
          {message.text}
        </div>
      )}
    </li>
  );
}

export function ChatPanel({ messages, status, error, onSend, onReset }: ChatPanelProps) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const streaming = status === 'streaming';

  // 새 글자가 붙을 때마다 목록의 끝을 보인다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages 와 status 는 끝으로 내리는 신호로만 쓴다
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, status]);

  async function send() {
    const message = text.trim();
    if (!message || streaming) return;
    setText('');
    const accepted = await onSend(message);
    if (!accepted) setText((current) => current || message);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const native = event.nativeEvent;
    if (
      isSendKey({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: native.isComposing,
        keyCode: native.keyCode,
      })
    ) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <section className="flex h-[60vh] min-h-80 min-w-0 flex-col rounded-lg border border-border bg-surface md:h-[calc(100vh-12rem)]">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-fg">{T.chatTitle}</h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={messages.length === 0 && !error}
          onClick={onReset}
        >
          {T.newChat}
        </Button>
      </header>
      {error && (
        <div className="border-b border-border px-4 py-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-fg">{T.chatEmpty}</p>
            <p className="text-sm text-fg-muted">{T.chatEmptyHint}</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((message, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 메시지는 붙기만 하고 순서가 바뀌지 않는다.
              <Message key={index} message={message} />
            ))}
          </ol>
        )}
        {streaming && (
          <p role="status" className="mt-3 animate-pulse text-xs text-fg-muted">
            {T.streaming}
          </p>
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="prd-chat-input">
          {T.inputLabel}
        </label>
        <textarea
          id="prd-chat-input"
          rows={2}
          value={text}
          placeholder={T.inputPlaceholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-10 min-w-0 flex-1 resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={streaming || !text.trim()}>
          {T.send}
        </Button>
      </form>
    </section>
  );
}
