import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './icons';

export type AlertTone = 'error' | 'info';

const TONE: Record<AlertTone, string> = {
  error: 'bg-danger-soft text-danger',
  info: 'bg-accent-soft text-accent-ink',
};

/**
 * 폼 위의 안쪽 알림(로그인 실패 등). 오류는 기본으로 `role="alert"` 로 바로 읽힌다.
 * 아이콘과 글을 함께 둬 색만으로 말하지 않는다.
 */
export function Alert({
  tone = 'error',
  icon,
  role,
  className,
  children,
}: {
  tone?: AlertTone;
  icon?: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : undefined)}
      className={cx(
        'flex items-start gap-3 rounded-md px-4 py-3.5 text-sm leading-relaxed',
        TONE[tone],
        className,
      )}
    >
      <span className="mt-[3px] flex-none [&_svg]:size-[18px]">
        {icon ?? <Icon name={tone === 'error' ? 'alert' : 'sparkle'} />}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
