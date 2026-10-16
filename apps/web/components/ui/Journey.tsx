import './ui.css';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { JOURNEY_STEPS, journeyProgress, journeyStones } from './journey-steps';

/**
 * 진행 표시: 네 칸의 디딤돌(ADR-0005). 위 줄 왼쪽은 `label`(넘치면 말줄임), 오른쪽은 기본 "3 / 4".
 * 목록 카드처럼 오른쪽 글을 바꾸려면 `meta` 를 넘긴다. 바깥은 `role="progressbar"`(0..4).
 */
export function Journey({
  task,
  label,
  valueText,
  meta,
  className,
}: {
  /** 서버의 task(0 처음 인사 … 5 마무리). */
  task: number;
  label?: ReactNode;
  /** 스크린리더가 읽을 글(예: 네 걸음 중 세 번째, 없는 일상에 적응하기). */
  valueText: string;
  meta?: ReactNode;
  className?: string;
}) {
  const progress = journeyProgress(task);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={JOURNEY_STEPS}
      aria-valuenow={progress.valueNow}
      aria-valuetext={valueText}
      className={cx('grid gap-2', className)}
    >
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate font-semibold">{label}</span>
        <span className="flex-none text-fg-muted tabular-nums">
          {meta ?? `${progress.step} / ${JOURNEY_STEPS}`}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {journeyStones(task).map((state, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 칸은 늘 네 개이고 순서가 곧 이름이다.
            key={index}
            data-stone={state}
            className={cx(
              'relative h-1.5 overflow-hidden rounded-pill transition-colors duration-(--t-slow) ease-soft',
              state === 'done' && 'bg-accent',
              state === 'now' &&
                'bg-[color-mix(in_srgb,var(--color-accent)_22%,var(--color-bg-sunk))]',
              state === 'todo' && 'bg-bg-sunk',
            )}
          >
            {state === 'now' && (
              <span className="ui-glow absolute inset-y-0 left-0 w-2/5 rounded-[inherit] bg-accent" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
