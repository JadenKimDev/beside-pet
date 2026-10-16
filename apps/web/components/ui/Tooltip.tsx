import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * 감싼 것에 hover 하거나 그 안에 포커스가 있을 때 위에 뜨는 짧은 설명.
 * 감싼 요소는 `aria-describedby={id}` 로 이 글을 가리켜야 한다.
 */
export function Tooltip({
  id,
  text,
  block,
  children,
}: {
  id: string;
  text: ReactNode;
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx('group/tip relative', block ? 'flex w-full' : 'inline-flex')}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-64 -translate-x-1/2 translate-y-1 rounded-md bg-fg px-3 py-1.5 text-small text-bg opacity-0 shadow-3 transition duration-(--t-fast) ease-soft group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100 group-hover/tip:translate-y-0 group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
