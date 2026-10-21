'use client';

import { cn } from '@/shared/lib';

export type SegmentedOption<Value extends string> = { value: Value; label: string };

export type SegmentedProps<Value extends string> = {
  /** 묶음의 접근성 이름. */
  label: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
};

export function Segmented<Value extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<Value>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-border bg-bg-sunk p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-8 rounded px-3 text-sm whitespace-nowrap',
              selected ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
