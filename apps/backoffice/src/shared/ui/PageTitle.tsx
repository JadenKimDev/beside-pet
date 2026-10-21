import type { ReactNode } from 'react';

export type PageTitleProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageTitle({ title, description, actions }: PageTitleProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
