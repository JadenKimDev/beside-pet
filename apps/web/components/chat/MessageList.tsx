'use client';

import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/ui';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import { readComposerHeight } from './composer-height';
import { MessageBubble } from './MessageBubble';
import { buildTimeline } from './timeline';
import type { Message } from './types';

/** 입력창 위 경계에서 이만큼 안이면 "바닥 근처"로 보고 새 답을 따라 내려간다. */
const NEAR_BOTTOM_PX = 220;

/**
 * 끝 표시가 보이는 바닥(화면 아래 끝에서 입력창이 덮는 높이를 뺀 자리)에서 얼마나 떨어져 있는가.
 * 창(window)이 스크롤된다. 입력창에 가린 만큼은 아직 바닥에 닿지 않은 것으로 본다.
 */
function distanceToBottom(end: HTMLElement): number {
  return end.getBoundingClientRect().bottom - (window.innerHeight - readComposerHeight(end));
}

/**
 * 말풍선 목록. 날짜 구분과 단계 구분선을 끼우고, 흐르는 동안은 `aria-busy` 로 알림을 미뤄
 * 토큰마다 읽히지 않고 완성된 답(`done`)만 읽힌다. 바닥 근처일 때만 새 답을 따라 내려가고,
 * 위를 읽고 있으면 "새 답이 있어요" 알약을 띄운다. 대화 흐름은 모르고 표시만 한다.
 */
export function MessageList({
  messages,
  after,
  onResend,
  onRetryReply,
  retryReplyId,
  lang,
  footer,
}: {
  messages: Message[];
  /** 말풍선 바로 아래에 끼울 것(위기 턴의 위기 카드). */
  after?: (message: Message) => ReactNode;
  onResend?: (message: Message) => void;
  /** "답 다시 받기". `retryReplyId` 의 말풍선에만 붙는다(다시 받을 수 있는 턴은 하나뿐이다). */
  onRetryReply?: (message: Message) => void;
  retryReplyId?: string;
  /** 대화 언어가 앱 언어와 다를 때 말풍선 묶음에 다는 `lang`. */
  lang?: string;
  /** 목록 끝, 마지막 말풍선 아래에 둘 것(마친 뒤 카드). */
  footer?: ReactNode;
}) {
  const translations = useTranslations();
  const { locale } = useLocale();
  const endRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const seen = useRef({ count: messages.length, text: 0 });
  const [newReply, setNewReply] = useState(false);
  const streaming = messages.some((message) => message.streaming === true);

  const scrollToEnd = useCallback((smooth: boolean) => {
    endRef.current?.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    nearBottom.current = true;
    setNewReply(false);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const end = endRef.current;
      if (!end) return;
      nearBottom.current = distanceToBottom(end) <= NEAR_BOTTOM_PX;
      if (nearBottom.current) setNewReply(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 글이 자라거나 말풍선이 늘 때: 바닥 근처면 따라가고, 아니면 새 답 알약을 띄운다.
  useLayoutEffect(() => {
    const last = messages.at(-1);
    const size = { count: messages.length, text: last?.text.length ?? 0 };
    const grew = size.count !== seen.current.count || size.text !== seen.current.text;
    seen.current = size;
    if (!grew) return;
    if (nearBottom.current) {
      scrollToEnd(false);
    } else if (last?.role === 'bot') {
      setNewReply(true);
    }
  }, [messages, scrollToEnd]);

  // 답이 끝나면 그 아래에 위기 카드나 마침 카드가 붙는다. 바닥 근처였으면 그것까지 보이게 내려간다.
  // 바닥에 새로 붙은 것(멈춤 안내)이 layout effect 에서 높이를 알린 뒤라야 하므로 useEffect 에서 한다.
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    const finished = wasStreaming.current && !streaming;
    wasStreaming.current = streaming;
    if (finished && nearBottom.current) scrollToEnd(false);
  }, [streaming, scrollToEnd]);

  const dayFormat = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="relative flex-1">
      <div
        aria-live="polite"
        aria-busy={streaming}
        lang={lang}
        className="mx-auto grid w-full max-w-read gap-4 px-4 pt-6 pb-[calc(var(--composer-height,0px)+2rem)]"
      >
        {buildTimeline(messages).map((row) => {
          if (row.kind === 'date') {
            return (
              <p key={row.key} className="m-0 py-2 text-center text-xs text-fg-muted">
                {dayFormat.format(new Date(row.day))}
              </p>
            );
          }
          if (row.kind === 'stage') {
            return (
              <div
                key={row.key}
                className="flex items-center gap-3 py-2 text-xs text-fg-muted before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
              >
                <span
                  data-stage-divider
                  className="inline-flex max-w-[80%] items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1 font-semibold [&_svg]:size-3.5 [&_svg]:flex-none"
                >
                  <Icon name="leaf" />
                  <span className="truncate">
                    {translations.chat.stage(row.task, translations.taskLabels[row.task])}
                  </span>
                </span>
              </div>
            );
          }
          const extra = after?.(row.message);
          return (
            <Fragment key={row.key}>
              <MessageBubble
                message={row.message}
                onResend={onResend}
                onRetryReply={row.message.id === retryReplyId ? onRetryReply : undefined}
              />
              {extra && <div>{extra}</div>}
            </Fragment>
          );
        })}
        {footer}
        {/* 입력창이 덮는 만큼 위에서 멈춘다(scrollIntoView 의 block: 'end'). */}
        <div
          ref={endRef}
          data-message-end
          style={{ scrollMarginBottom: 'var(--composer-height, 0px)' }}
        />
      </div>
      {newReply && (
        <div className="pointer-events-none sticky bottom-[var(--composer-height,0px)] z-10 flex justify-center">
          <button
            type="button"
            onClick={() => scrollToEnd(true)}
            className="ui-rise pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-border bg-surface-raised px-4 py-2 text-[13px] font-semibold text-fg shadow-2 focus-visible:shadow-focus focus-visible:outline-none [&_svg]:size-4"
          >
            {translations.chat.newReply}
            <Icon name="arrow-up" className="rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}
