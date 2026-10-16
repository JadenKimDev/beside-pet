'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/i18n/I18nProvider';

/** Hard cap per message; the counter below the field shows usage against it. */
const MAX_MESSAGE_LENGTH = 500;
/** The textarea grows with content up to this height, then scrolls. */
const MAX_FIELD_HEIGHT_PX = 160;

/** Text input — knows nothing about flow/state; just delegates via onSend. Shared. */
export function Composer({
  disabled,
  placeholder,
  onSend,
}: {
  disabled: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
}) {
  const translations = useTranslations();
  const [text, setText] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  /** Set on send so the field can reclaim focus once the reply finishes. */
  const refocusPending = useRef(false);

  // Sending disables the field, which drops focus; restore it when the reply
  // lands so the next turn needs no extra click. Never steals focus on mount.
  useEffect(() => {
    if (!disabled && refocusPending.current) {
      refocusPending.current = false;
      fieldRef.current?.focus();
    }
  }, [disabled]);

  const resize = (): void => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    const full = field.scrollHeight;
    field.style.height = `${Math.min(full, MAX_FIELD_HEIGHT_PX)}px`;
    // Only scrollable once it has reached its cap, so no bar appears before that.
    field.style.overflowY = full > MAX_FIELD_HEIGHT_PX ? 'auto' : 'hidden';
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    refocusPending.current = true;
    requestAnimationFrame(resize);
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-black/5 bg-surface px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="min-w-0 flex-1">
        <textarea
          ref={fieldRef}
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => {
            setText(event.target.value.slice(0, MAX_MESSAGE_LENGTH));
            resize();
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter inserts a line break.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={placeholder ?? translations.chat.placeholder}
          className="no-scrollbar block w-full resize-none overflow-y-hidden rounded-xl border border-black/10 bg-background px-4 py-2.5 leading-relaxed outline-none focus:border-accent disabled:opacity-50"
        />
        <p
          className={`mt-1 pr-1 text-right text-[11px] ${
            text.length >= MAX_MESSAGE_LENGTH ? 'text-red-500' : 'text-muted'
          }`}
        >
          {text.length}/{MAX_MESSAGE_LENGTH}
        </p>
      </div>
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="mb-6 rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {translations.chat.send}
      </button>
    </form>
  );
}
