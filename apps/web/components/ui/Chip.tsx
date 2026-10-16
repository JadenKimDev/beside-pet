'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  selected?: boolean;
  children: ReactNode;
};

/**
 * 선택지 칩(온보딩). 높이 48 이상, 줄바꿈 허용. 고른 것은 `aria-pressed`.
 * 화살표로 옮기는 radiogroup 이 필요하면 호출하는 쪽이 `role="radio"`·`aria-checked` 를 넘긴다.
 */
export function Chip({
  selected = false,
  className,
  type = 'button',
  children,
  ...rest
}: ChipProps) {
  const radio = rest.role === 'radio';
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={radio ? undefined : selected}
      aria-checked={radio ? selected : undefined}
      className={cx(
        'min-h-12 cursor-pointer rounded-pill border px-[18px] py-3 text-left text-[15px] leading-snug transition-[border-color,background-color,transform] duration-(--t-fast) ease-soft hover:-translate-y-px hover:border-accent focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0',
        selected
          ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
          : 'border-border bg-surface text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 칩을 줄바꿈하며 늘어놓는다(간격 10). */
export function ChipList({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('flex flex-wrap gap-2.5', className)}>{children}</div>;
}
