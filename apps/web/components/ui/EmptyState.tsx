import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * 빈 상태와 실패 상태. 가운데 정렬, 220px 원형 삽화(또는 `icon` 을 담은 원), 제목, 설명, 행동 하나.
 * 실패 상태는 삽화 대신 `icon` 과 "다시 불러오기" 주 버튼(`action`), 그리고 안심 문장(`reassurance`)을 둔다.
 */
export function EmptyState({
  art,
  icon,
  title,
  description,
  reassurance,
  action,
  headingLevel = 2,
  className,
}: {
  /** 원 안에 채울 삽화(`<img alt="">`). 없으면 그라데이션 원만 남는다. */
  art?: ReactNode;
  /** 실패 상태의 아이콘. 주면 작은 아이콘 원을 그린다. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  reassurance?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <div className={cx('grid justify-items-center gap-3 px-4 py-12 text-center', className)}>
      {icon ? (
        <div className="grid size-20 place-items-center rounded-full bg-bg-sunk text-fg-muted [&_svg]:size-8">
          {icon}
        </div>
      ) : (
        <div className="size-[220px] max-w-full overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_40%,var(--color-warm),var(--color-bg-sunk)_70%)] shadow-[inset_0_0_0_1px_var(--color-border)] [&_img]:size-full [&_img]:object-cover">
          {art}
        </div>
      )}
      <Heading className="m-0 mt-3 text-h2">{title}</Heading>
      {description && <p className="m-0 max-w-[360px] text-fg-muted">{description}</p>}
      {reassurance && <p className="m-0 max-w-[360px] text-small text-fg-muted">{reassurance}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
