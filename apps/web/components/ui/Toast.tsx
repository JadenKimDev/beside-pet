'use client';

import './ui.css';
import { type ReactNode, useEffect, useRef } from 'react';
import { cx } from './cx';
import { Icon } from './icons';

/** 성공 토스트가 머무는 시간. 오류 토스트는 스스로 닫히지 않는다. */
export const TOAST_LIFETIME_MS = 4000;

export type ToastTone = 'default' | 'error';

/**
 * 아래 가운데 알림. 한 번에 하나만 그린다(여럿을 쌓는 것은 호출하는 쪽이 하나로 바꿔 넣는다).
 * 기본은 뒤집힌 색(`fg` 바탕)으로 4초 뒤 `onDismiss`. 오류는 `danger` 바탕으로 머물며 [다시 시도]를 둔다.
 */
export function Toast({
  message,
  tone = 'default',
  icon,
  retryLabel,
  onRetry,
  onDismiss,
}: {
  message: ReactNode;
  tone?: ToastTone;
  icon?: ReactNode;
  retryLabel?: ReactNode;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const error = tone === 'error';

  // biome-ignore lint/correctness/useExhaustiveDependencies: 메시지가 바뀌면 4초를 새로 센다.
  useEffect(() => {
    if (error) return;
    const timer = setTimeout(() => dismiss.current(), TOAST_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [error, message]);

  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cx(
        'ui-rise fixed bottom-7 left-1/2 z-[60] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-pill py-3 pr-3.5 pl-[18px] text-sm shadow-3 [&_svg]:size-[18px] [&_svg]:flex-none',
        error ? 'bg-danger text-danger-fg' : 'bg-fg text-bg',
      )}
    >
      {icon ?? <Icon name={error ? 'alert' : 'check'} />}
      <span className="min-w-0">{message}</span>
      {error && onRetry && retryLabel && (
        <button
          type="button"
          onClick={onRetry}
          className="h-8 flex-none cursor-pointer rounded-pill border border-[color-mix(in_srgb,currentColor_35%,transparent)] bg-transparent px-3 text-[13px] font-semibold text-current focus-visible:shadow-focus focus-visible:outline-none"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
