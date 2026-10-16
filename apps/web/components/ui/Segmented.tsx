'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';

export type SegmentedOption<V extends string> = { value: V; label: ReactNode };

/**
 * 알약 안의 버튼 묶음(대화 언어, 앱 언어, 관리자 필터). 하나만 눌린 상태다.
 * `role="group"` 과 칸마다 `aria-pressed`. 모바일에서는 칸을 고르게 늘린다.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  /** 묶음의 이름(스크린리더). */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex gap-1 rounded-pill bg-bg-sunk p-1 max-sm:flex max-sm:w-full',
        className,
      )}
    >
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => {
              if (!pressed) onChange(option.value);
            }}
            className={cx(
              'cursor-pointer rounded-pill px-[18px] py-2 text-sm transition-[background-color,color,box-shadow] duration-(--t-fast) ease-soft focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 max-sm:flex-1',
              pressed ? 'bg-surface font-semibold text-fg shadow-1' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
