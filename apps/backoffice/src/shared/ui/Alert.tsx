import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';

export type AlertTone = 'info' | 'danger';

const TONES: Record<AlertTone, string> = {
  info: 'border-border bg-accent-soft text-fg',
  danger: 'border-danger bg-danger-soft text-danger',
};

export function Alert({ tone = 'info', children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-sm', TONES[tone])}
    >
      {children}
    </div>
  );
}
