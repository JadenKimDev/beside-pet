import { cx } from './cx';

/**
 * 로고. 32 그리드: `accent` 큰 원(반지름 12) 안에 `accent-fg` 발바닥, 오른쪽 아래에 `warm` 작은 원이 겹친다.
 * "곁에(beside)" 있는 두 존재. `markOnly` 는 favicon 처럼 큰 원과 발바닥만 그린다.
 * 글자 상표(`wordmark`)는 호출하는 쪽이 넘긴다. 글자가 없으면 `label` 이 이름이 된다.
 */
export function LogoMark({
  markOnly,
  label,
  className,
}: {
  markOnly?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="28"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle cx="13" cy="16" r="12" className="fill-accent" />
      {!markOnly && <circle cx="24.5" cy="20.5" r="6.5" className="fill-warm" opacity=".95" />}
      <g transform="translate(4.6 7.4) scale(.7)" className="fill-accent-fg">
        <ellipse cx="12" cy="16" rx="4.2" ry="3.4" />
        <circle cx="6.5" cy="11" r="1.9" />
        <circle cx="9.5" cy="7.3" r="1.9" />
        <circle cx="14.5" cy="7.3" r="1.9" />
        <circle cx="17.5" cy="11" r="1.9" />
      </g>
    </svg>
  );
}

/** 표식 + 글자 상표(Gowun Batang 700 19px). 링크로 감싸는 것은 호출하는 쪽이다. */
export function Logo({ wordmark, className }: { wordmark: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2.5 whitespace-nowrap font-serif text-[19px] font-bold text-fg',
        className,
      )}
    >
      <LogoMark className="size-7" />
      <span>{wordmark}</span>
    </span>
  );
}
