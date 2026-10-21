'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';

export type SegmentedOption<V extends string> = { value: V; label: ReactNode };

/**
 * 알약 안의 버튼 묶음(대화 언어, 앱 언어, 관리자 필터). 하나만 눌린 상태다.
 * `role="group"` 과 칸마다 `aria-pressed`. 모바일에서는 칸이 44px 이상이고, 기본(`fill`)은 묶음이 줄을 채우며
 * 칸을 고르게 나눈다(글이 길면 칸 안에서 줄바꿈). `fill={false}` 는 머리처럼 좁은 줄 안에서 쓰는 모양으로,
 * 늘리지 않고 글자를 한 줄로 둔다.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  fill = true,
  className,
}: {
  /** 묶음의 이름(스크린리더). */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  /** 모바일에서 묶음이 줄을 채우고 칸을 고르게 나눌지. 머리 안에서는 false. */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex gap-1 rounded-pill bg-bg-sunk p-1',
        fill ? 'max-sm:flex max-sm:w-full' : 'flex-none',
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
              'cursor-pointer rounded-pill px-[18px] py-2 text-sm transition-[background-color,color,box-shadow] duration-(--t-fast) ease-soft focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 max-sm:min-h-11 max-sm:px-3',
              fill ? 'max-sm:min-w-0 max-sm:flex-1' : 'whitespace-nowrap',
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
