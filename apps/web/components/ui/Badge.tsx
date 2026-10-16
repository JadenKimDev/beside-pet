import './ui.css';
import type { ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'default' | 'live' | 'warn' | 'danger';

const TONE: Record<BadgeTone, string> = {
  default: 'bg-bg-sunk text-fg-muted',
  live: 'bg-accent-soft text-accent-ink',
  warn: 'bg-crisis-bg text-crisis-ink',
  danger: 'bg-danger-soft text-danger',
};

/** 작은 상태 표시. 색만으로 말하지 않도록 글은 늘 함께 넘긴다. live 는 숨쉬는 점을 단다. */
export function Badge({
  tone = 'default',
  icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-[3px] text-xs font-semibold [&_svg]:size-[13px]',
        TONE[tone],
        className,
      )}
    >
      {tone === 'live' && (
        <span aria-hidden="true" className="ui-breathe size-1.5 rounded-full bg-current" />
      )}
      {icon}
      {children}
    </span>
  );
}
