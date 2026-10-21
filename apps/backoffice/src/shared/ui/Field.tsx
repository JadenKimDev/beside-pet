import type { ReactNode } from 'react';

export type FieldProps = {
  label: ReactNode;
  /** 라벨이 가리킬 컨트롤의 id. */
  htmlFor: string;
  error?: ReactNode;
  children: ReactNode;
};

export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
