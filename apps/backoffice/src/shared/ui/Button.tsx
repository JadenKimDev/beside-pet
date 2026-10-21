import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-bg-sunk',
  ghost: 'bg-transparent text-fg hover:bg-bg-sunk',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
