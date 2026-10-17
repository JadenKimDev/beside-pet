import { Skeleton, SkeletonArea } from '@/components/ui';

/** 불러오는 동안의 목록: 인사 두 줄, 큰 카드, 항목 두 개. 300ms 뒤에야 보인다. */
export function SessionsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonArea label={label}>
      <Skeleton className="h-3.5 w-[120px]" />
      <Skeleton className="mt-3 h-[34px] w-[280px] max-w-full" />
      <Skeleton className="mt-8 h-[220px] rounded-xl" />
      <Skeleton className="mt-14 h-4 w-[100px]" />
      {['w-3/5', 'w-1/2'].map((width) => (
        <div
          key={width}
          className="mt-3 grid grid-cols-[72px_1fr] gap-5 rounded-lg border border-border bg-surface px-5 py-[18px] max-sm:grid-cols-[56px_1fr]"
        >
          <Skeleton className="h-[60px]" />
          <div>
            <Skeleton className={`h-4 ${width}`} />
            <Skeleton className="mt-2.5 h-3 w-2/5" />
          </div>
        </div>
      ))}
    </SkeletonArea>
  );
}
