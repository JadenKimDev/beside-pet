'use client';

import type { ConversationsResponse } from '@/entities/metrics';
import { cn } from '@/shared/lib';
import { Card, EmptyState, Skeleton } from '@/shared/ui';
import {
  conversationCards,
  conversationChartRows,
  hasConversations,
  replyLabelRows,
} from '../model/cards';
import { ConversationCharts } from './ConversationCharts';
import { ReplyLabelTable } from './ReplyLabelTable';

export type ConversationDashboardProps = {
  /** 마지막으로 받은 응답. 아직 없으면 null. 다시 받는 중에도 지우지 않는다. */
  data: ConversationsResponse | null;
  loading: boolean;
};

/** 대화: 카드 셋, 날짜별 그래프 둘, 날짜별 답의 라벨 표. 위기 감지는 수만 보이고 어떤 턴인지는 보이지 않는다. */
export function ConversationDashboard({ data, loading }: ConversationDashboardProps) {
  if (data === null) {
    return (
      <div className="flex flex-col gap-6">
        <p className="sr-only" role="status">
          불러오고 있어요
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-[92px]" />
          <Skeleton className="h-[92px]" />
          <Skeleton className="h-[92px]" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[260px]" />
        </div>
      </div>
    );
  }
  const rows = conversationChartRows(data);
  return (
    <div className="flex flex-col gap-6" aria-busy={loading || undefined}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {conversationCards(data).map((card) => (
          <Card
            key={card.id}
            className={cn('p-3.5 sm:p-4', card.tone === 'warning' && 'border-l-4 border-l-warning')}
          >
            <p className="text-xs text-fg-muted">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums md:text-[28px]">
              {card.value}
            </p>
            {card.note && <p className="mt-0.5 text-xs text-fg-muted tabular-nums">{card.note}</p>}
          </Card>
        ))}
      </div>
      {hasConversations(rows) ? (
        <>
          <ConversationCharts rows={rows} />
          <ReplyLabelTable rows={replyLabelRows(data)} />
        </>
      ) : (
        <Card>
          <EmptyState title="이 기간에는 대화가 없어요." description="기간을 넓혀 보세요." />
        </Card>
      )}
    </div>
  );
}
