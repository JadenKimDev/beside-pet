import { cx } from '@/components/ui';

/**
 * 리포트의 네 걸음: 번호 원 네 개를 선으로 이은 큰 모양(§6.8). 도달한 칸(`reached`, 1..4)까지 채운다.
 * 글자(걸음 이름, 묶음 이름)는 부르는 쪽이 넘긴다.
 */
export function ReportSteps({
  reached,
  names,
  label,
}: {
  reached: number;
  names: readonly [string, string, string, string];
  label: string;
}) {
  return (
    <ol aria-label={label} className="m-0 grid list-none grid-cols-4 p-0">
      {names.map((name, index) => {
        const step = index + 1;
        const filled = step <= reached;
        return (
          <li
            key={name}
            data-filled={filled}
            className="relative grid justify-items-center gap-2 text-center"
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cx(
                  'absolute top-[17px] right-1/2 h-0.5 w-full',
                  step <= reached ? 'bg-accent' : 'bg-border',
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cx(
                'relative grid size-9 place-items-center rounded-full border-2 text-small font-semibold tabular-nums',
                filled
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-border bg-surface text-fg-muted',
              )}
            >
              {step}
            </span>
            <span
              className={cx('text-caption', filled ? 'font-semibold text-fg' : 'text-fg-muted')}
            >
              {name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
