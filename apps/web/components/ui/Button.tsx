'use client';

import { type ButtonHTMLAttributes, type MouseEvent, type ReactNode, type Ref, useId } from 'react';
import { cx } from './cx';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill border border-transparent font-semibold no-underline transition-[background-color,border-color,color,box-shadow,transform,filter] duration-(--t-fast) ease-soft focus-visible:shadow-focus focus-visible:outline-none [&_svg]:size-[18px] [&_svg]:shrink-0';

const SIZE: Record<ButtonSize, string> = {
  // 모바일은 44px 터치 대상(데스크톱 모양은 그대로).
  sm: 'h-9 px-3.5 text-[13px] max-sm:h-11',
  md: 'h-12 px-[22px] text-[15px]',
  lg: 'h-14 px-7 text-base',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg shadow-1',
  secondary: 'border-border bg-surface text-fg',
  ghost: 'bg-transparent text-fg-muted',
  danger: 'bg-danger text-danger-fg',
  'danger-ghost': 'bg-transparent text-danger',
};

/** 움직임과 hover 는 누를 수 있을 때만 붙인다(비활성은 그림자와 움직임 없음). */
const LIVE: Record<ButtonVariant, string> = {
  primary: 'hover:-translate-y-px hover:bg-accent-hover hover:shadow-2',
  secondary: 'hover:border-border-strong hover:bg-surface-raised',
  ghost: 'hover:bg-bg-sunk hover:text-fg',
  danger: 'hover:brightness-95',
  'danger-ghost': 'hover:bg-danger-soft',
};

export type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** 비활성 모양(투명도 .45, not-allowed). */
  inactive?: boolean;
};

/** 버튼 모양의 클래스. 링크(`<Link>`)를 버튼처럼 보일 때도 쓴다. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  block,
  inactive,
}: ButtonClassOptions = {}): string {
  return cx(
    BASE,
    SIZE[size],
    VARIANT[variant],
    block && 'w-full',
    inactive
      ? 'cursor-not-allowed opacity-45 shadow-none'
      : cx(LIVE[variant], 'cursor-pointer active:translate-y-px active:scale-[.99]'),
  );
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** 일하는 중: 글자를 감추고 스피너를 가운데 둔다. 너비는 그대로이고 누름을 받지 않는다. */
  busy?: boolean;
  /**
   * 비활성인 이유. `disabled` 와 함께 주면 버튼은 포커스를 받는 채로(aria-disabled) 누름만 막고,
   * 이 글을 툴팁으로 보이며 스크린리더에 설명으로 읽힌다.
   */
  disabledReason?: ReactNode;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  busy = false,
  disabled = false,
  disabledReason,
  iconStart,
  iconEnd,
  children,
  className,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const tipId = useId();
  const explained = disabled && !busy && disabledReason != null;
  const blocked = disabled || busy;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  const button = (
    <button
      {...rest}
      type={type}
      disabled={blocked && !explained}
      aria-disabled={explained ? true : undefined}
      aria-busy={busy ? true : undefined}
      aria-describedby={explained ? tipId : rest['aria-describedby']}
      onClick={handleClick}
      className={cx(
        buttonClass({ variant, size, block, inactive: disabled && !busy }),
        busy && 'cursor-wait',
        className,
      )}
    >
      <span className={cx('inline-flex items-center gap-2', busy && 'opacity-0')}>
        {iconStart}
        {children}
        {iconEnd}
      </span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  );

  if (!explained) return button;
  return (
    <Tooltip id={tipId} text={disabledReason} block={block}>
      {button}
    </Tooltip>
  );
}
