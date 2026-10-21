import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';

export type CardProps = {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Card({ title, actions, className, children }: CardProps) {
  return (
    <section className={cn('rounded-lg border border-border bg-surface p-4', className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
