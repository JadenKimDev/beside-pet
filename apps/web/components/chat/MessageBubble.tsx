'use client';

import '@/components/ui/ui.css';
import './chat.css';
import { cx, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import type { Message } from './types';

/**
 * 말풍선. 마음이는 왼쪽(surface + 테두리, 앞에 발바닥 아바타. 모바일은 숨김), 사용자는 오른쪽(accent-soft).
 * 상태: 첫 글자 기다림(점 세 개), 흐르는 중(끝에 커서), 보내는 중(옅게 + 보내는 중),
 * 보내지 못함(점선 + 다시 보내기), 답을 받지 못함(사용자 말 아래 한 줄 + 답 다시 받기). 표시만 한다.
 */
export function MessageBubble({
  message,
  onResend,
  onRetryReply,
}: {
  message: Message;
  /** 보내지 못한 사용자 말풍선의 "다시 보내기". 없으면 버튼을 두지 않는다. */
  onResend?: (message: Message) => void;
  /** 답을 받지 못한 사용자 말풍선의 "답 다시 받기"(말은 다시 보내지 않는다). 없으면 버튼을 두지 않는다. */
  onRetryReply?: (message: Message) => void;
}) {
  const translations = useTranslations();
  const isUser = message.role === 'user';
  const waiting = message.streaming === true && message.text.length === 0;
  const flowing = message.streaming === true && message.text.length > 0;

  return (
    <div
      data-message-role={message.role}
      data-sending={message.sending ? '' : undefined}
      className={cx('ui-rise flex items-end gap-2.5', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <span
          aria-hidden="true"
          className="grid size-8 flex-none place-items-center rounded-full bg-accent-soft text-accent-ink max-sm:hidden [&_svg]:size-[18px]"
        >
          <Icon name="paw" />
        </span>
      )}
      <div
        className={cx(
          'grid max-w-[min(560px,82%)] gap-1.5 max-sm:max-w-[88%]',
          isUser && 'justify-items-end',
        )}
      >
        <div
          className={cx(
            'rounded-bubble px-[18px] py-3 text-body-l whitespace-pre-wrap break-words text-fg max-sm:text-[15px]',
            isUser
              ? 'rounded-br-[6px] bg-accent-soft'
              : 'rounded-bl-[6px] border border-border bg-surface shadow-1',
            message.failed && 'border border-dashed border-danger opacity-70',
            message.sending && 'opacity-70',
          )}
        >
          {waiting ? (
            <TypingDots label={translations.chat.typing} />
          ) : (
            <span data-message-text>
              {message.text}
              {flowing && <span aria-hidden="true" className="chat-caret" />}
            </span>
          )}
        </div>
        {message.sending && (
          <p role="status" className="m-0 text-small text-fg-muted">
            {translations.chat.sending}
          </p>
        )}
        {message.replyFailed && (
          <p className="m-0 flex items-center gap-1.5 text-small text-fg-muted [&_svg]:size-3.5">
            <Icon name="alert" />
            <span>{translations.chat.replyFailed}</span>
            {onRetryReply && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onRetryReply(message)}
                  className="cursor-pointer rounded-sm bg-transparent p-0 font-semibold text-fg underline underline-offset-2 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  {translations.chat.retryReply}
                </button>
              </>
            )}
          </p>
        )}
        {message.failed && (
          <p className="m-0 flex items-center gap-1.5 text-small text-danger [&_svg]:size-3.5">
            <Icon name="alert" />
            <span>{translations.chat.sendFailed}</span>
            {onResend && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onResend(message)}
                  className="cursor-pointer rounded-sm bg-transparent p-0 font-semibold text-danger underline underline-offset-2 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  {translations.chat.resend}
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** 첫 토큰 전의 점 세 개(1.4s 숨쉬기, 0.18s 시차). */
function TypingDots({ label }: { label: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-1.5 py-2">
      <span className="chat-dot" />
      <span className="chat-dot [animation-delay:.18s]" />
      <span className="chat-dot [animation-delay:.36s]" />
    </span>
  );
}
