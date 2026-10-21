'use client';

import {
  type BreakdownFilter,
  filterUsage,
  type ModelsResponse,
  summarizeUsage,
} from '@/entities/metrics';
import { BreakdownFilterBar, DEFAULT_FILTER } from '@/features/filter-breakdown';
import { Button, Card, EmptyState, Skeleton } from '@/shared/ui';
import { modelCards } from '../model/cards';
import { BreakdownTable } from './BreakdownTable';
import { StatGrid } from './StatGrid';
import { UsageCharts } from './UsageCharts';

export type ModelDashboardProps = {
  /** 마지막으로 받은 응답. 아직 없으면 null. 다시 받는 중에도 지우지 않는다. */
  data: ModelsResponse | null;
  loading: boolean;
  filter: BreakdownFilter;
  onFilterChange: (filter: BreakdownFilter) => void;
};

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <p className="sr-only" role="status">
        불러오고 있어요
      </p>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 자리 표시 블록은 순서가 바뀌지 않는다
          <Skeleton key={index} className="h-[92px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-[260px] md:col-span-2" />
        <Skeleton className="h-[260px]" />
        <Skeleton className="h-[260px]" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

/** 모델 계측: 거르기, 카드, 날짜별 그래프, 나눠 보기. 기간과 데이터는 views 가 넘긴다. */
export function ModelDashboard({ data, loading, filter, onFilterChange }: ModelDashboardProps) {
  const rows = data ? filterUsage(data.models, filter) : [];
  return (
    <div className="flex flex-col gap-6" aria-busy={loading || undefined}>
      <BreakdownFilterBar rows={data?.models ?? []} value={filter} onChange={onFilterChange} />
      {data === null ? (
        <Loading />
      ) : (
        <>
          <StatGrid cards={modelCards(summarizeUsage(rows))} />
          {data.models.length === 0 ? (
            <Card>
              <EmptyState
                title="이 기간에는 모델 호출이 없어요."
                description="기간을 넓혀 보세요."
              />
            </Card>
          ) : (
            <>
              <UsageCharts response={data} />
              <section className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-fg">묶음별 나눠 보기</h2>
                {rows.length === 0 ? (
                  <Card className="flex flex-col items-center gap-2 py-8">
                    <p className="text-sm text-fg">고른 역할과 버전에 맞는 호출이 없어요.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onFilterChange(DEFAULT_FILTER)}
                    >
                      거르기 지우기
                    </Button>
                  </Card>
                ) : (
                  <BreakdownTable rows={rows} />
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
