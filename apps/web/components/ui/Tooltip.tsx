import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * 감싼 것에 hover 하거나 그 안에 포커스가 있을 때 위에 뜨는 짧은 설명.
 * 감싼 요소는 `aria-describedby={id}` 로 이 글을 가리켜야 한다(숨어 있어도 설명으로 읽힌다).
 * 숨어 있을 때는 `display: none` 이라 문서 폭에 들지 않는다(투명하게만 두면 좁은 폭에서 가로로 넘친다).
 * 모바일에서는 감싼 것의 오른쪽 끝에 맞춰 뜬다. 지금 쓰는 곳(잠긴 리포트 버튼)이 모두 줄의 오른쪽 끝이라서다.
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
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md bg-fg px-3 py-1.5 text-small text-bg shadow-3 transition-[opacity,translate,display] transition-discrete duration-(--t-fast) ease-soft group-focus-within/tip:block group-hover/tip:block starting:translate-y-1 starting:opacity-0 max-sm:right-0 max-sm:left-auto max-sm:translate-x-0"
      >
        {text}
      </span>
    </span>
  );
}
