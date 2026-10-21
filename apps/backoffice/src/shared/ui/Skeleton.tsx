import { cn } from '@/shared/lib';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-bg-sunk', className)} />;
}
