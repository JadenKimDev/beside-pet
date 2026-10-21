'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** 아이콘만 있으므로 이름이 반드시 있어야 한다. */
  label: string;
  icon: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

/** 40px 원형 아이콘 버튼(머리의 뒤로, 메뉴, 닫기). 모바일은 44px 로 키워 터치 대상을 맞춘다. */
export function IconButton({ label, icon, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cx(
        'inline-grid size-10 cursor-pointer max-sm:size-11 place-items-center rounded-full bg-transparent text-fg-muted transition-colors duration-(--t-fast) ease-soft hover:bg-bg-sunk hover:text-fg focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-5',
        className,
      )}
    >
      {icon}
    </button>
  );
}
