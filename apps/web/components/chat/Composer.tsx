'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cx, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import { useComposerHeight } from './composer-height';

/** Hard cap per message; the counter below the field shows usage against it. */
const MAX_MESSAGE_LENGTH = 500;
/** From here the counter turns `danger`. */
const NEAR_LIMIT = 480;
/** The textarea grows with content up to this height, then scrolls. */
const MAX_FIELD_HEIGHT_PX = 168;

/** The round button at the field's end (send, or stop while a reply comes in). */
const ROUND_BUTTON =
  'grid size-11 flex-none cursor-pointer place-items-center rounded-full bg-accent text-accent-fg transition-[background-color,opacity] duration-(--t-fast) hover:bg-accent-hover focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-accent [&_svg]:size-5';

/**
 * 입력 상자. 흐름과 상태는 모르고 onSend 로 넘기기만 한다(온보딩과 대화가 함께 쓴다).
 * - `busy`: 답이 흐르는 중. 보내기만 잠기고 입력은 계속 할 수 있다(다음 말을 미리 적어 둘 수 있게).
 * - `disabled`: 입력까지 막는다.
 * 화면 아래에 붙고(sticky), 위로 `bg` 그라데이션이 말풍선을 덮어 경계를 만든다.
 * 덮는 높이를 재어 `--composer-height` 로 알리고(목록이 그만큼 위에서 멈춘다), 사라질 때 0 으로 되돌린다.
 * `footer` 는 입력 아래에 함께 붙는 것(대화 화면의 위기 띠)이고 재는 높이에 들어간다.
 * - `onStop`: 있으면 `busy` 동안 보내기 자리가 중단 버튼이 된다(`stopDisabled` 면 잠긴다). 온보딩은 넘기지 않는다.
 * - `restore`: 중단한 말을 입력창에 되돌린다. `key` 가 바뀔 때마다 한 번 넣는다(적어 둔 글이 있으면 그 앞에 붙인다).
 */
export function Composer({
  disabled = false,
  busy = false,
  placeholder,
  footer,
  onSend,
  onStop,
  stopDisabled = false,
  restore,
}: {
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  footer?: ReactNode;
  onSend: (text: string) => void;
  onStop?: () => void;
  stopDisabled?: boolean;
  restore?: { text: string; key: number };
}) {
  const translations = useTranslations();
  const [text, setText] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  /** Set on send so the field can reclaim focus once the reply finishes. */
  const refocusPending = useRef(false);
  const locked = disabled || busy;
  const stoppable = busy && onStop !== undefined;

  // Disabling the field drops focus; restore it when the reply lands so the
  // next turn needs no extra click. Never steals focus on mount.
  useEffect(() => {
    if (!locked && refocusPending.current) {
      refocusPending.current = false;
      fieldRef.current?.focus();
    }
  }, [locked]);

  // 중단한 말이 돌아오면 입력창에 넣고 그 자리에 포커스를 둔다.
  const restoredKey = useRef(restore?.key);
  useEffect(() => {
    if (!restore || restore.key === restoredKey.current) return;
    restoredKey.current = restore.key;
    setText((current) =>
      (current.trim() ? `${restore.text}\n${current}` : restore.text).slice(0, MAX_MESSAGE_LENGTH),
    );
    requestAnimationFrame(resize);
    fieldRef.current?.focus();
  });

  // 자기 높이를 재어 목록에 알린다. textarea 가 자라면 ResizeObserver 가 다시 잰다.
  useComposerHeight(formRef);

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
    if (!trimmed || locked) return;
    onSend(trimmed);
    setText('');
    refocusPending.current = true;
    requestAnimationFrame(resize);
  };

  return (
    <form
      ref={formRef}
      className="sticky bottom-0 z-10 mx-auto w-full max-w-read bg-[linear-gradient(to_bottom,transparent,var(--color-bg)_28px)] px-4 pt-7 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-[28px] border border-border-strong bg-surface py-1.5 pr-1.5 pl-5 shadow-2 transition-[border-color,box-shadow] duration-(--t-fast) focus-within:border-accent focus-within:shadow-focus">
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
          aria-label={placeholder ?? translations.chat.placeholder}
          className="no-scrollbar block min-h-11 min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent py-2.5 text-base leading-relaxed text-fg outline-none placeholder:text-fg-muted disabled:opacity-50"
        />
        {stoppable ? (
          <button
            type="button"
            aria-label={translations.chat.stop}
            disabled={stopDisabled}
            onClick={onStop}
            className={ROUND_BUTTON}
          >
            <span aria-hidden="true" className="size-3.5 rounded-[3px] bg-current" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label={translations.chat.send}
            disabled={locked || !text.trim()}
            className={ROUND_BUTTON}
          >
            <Icon name="arrow-up" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-2 text-xs text-fg-muted">
        <span className={cx(!busy && 'max-sm:invisible')}>
          {stoppable
            ? translations.chat.stopHint
            : busy
              ? translations.chat.waitHint
              : translations.chat.enterHint}
        </span>
        <span className={cx('flex-none tabular-nums', text.length >= NEAR_LIMIT && 'text-danger')}>
          {text.length} / {MAX_MESSAGE_LENGTH}
        </span>
      </div>
      {footer}
    </form>
  );
}
