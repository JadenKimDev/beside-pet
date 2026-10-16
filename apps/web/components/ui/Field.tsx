import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cx } from './cx';
import { Icon } from './icons';

/** Field 가 안의 입력에 넘기는 연결. 입력에 그대로 펼친다(`<Input {...control} />`). */
export type FieldControl = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

/**
 * 라벨(13px 600, 위 6px), 입력, 힌트(12px), 오류(12px, 아이콘 포함)를 묶는다.
 * 입력은 render prop 으로 받아 id·설명·오류 상태를 이어 준다.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (control: FieldControl) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cx('grid gap-1.5 text-left', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="m-0 text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="m-0 flex items-center gap-1.5 text-xs text-danger">
          <Icon name="alert" className="size-3.5 flex-none" />
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** 오류 테두리. Field 안이면 `aria-invalid` 로도 켜진다. */
  invalid?: boolean;
  /** `lg` 는 온보딩 이름 입력(높이 56, 글 17). */
  inputSize?: 'md' | 'lg';
};

export function Input({ invalid, inputSize = 'md', className, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid ? true : rest['aria-invalid']}
      className={cx(
        'w-full rounded-md border border-border-strong bg-surface px-4 text-fg transition-[border-color,box-shadow] duration-(--t-fast) ease-soft placeholder:text-fg-muted placeholder:opacity-80 hover:border-fg-muted focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_20%,transparent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger',
        inputSize === 'lg' ? 'h-14 rounded-pill px-5 text-[17px]' : 'h-12 text-[15px]',
        className,
      )}
    />
  );
}
