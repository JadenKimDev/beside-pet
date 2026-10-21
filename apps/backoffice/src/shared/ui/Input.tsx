import type { InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';

export const fieldControlClass =
  'h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldControlClass, className)} {...rest} />;
}
