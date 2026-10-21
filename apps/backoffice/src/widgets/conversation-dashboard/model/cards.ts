// 대화 화면의 카드와 그래프 데이터(화면 안 7절). 위기 감지는 수만 다룬다.
import {
  type ConversationsResponse,
  fillConversationDays,
  genericComfortRate,
  summarizeConversations,
} from '@/entities/metrics';
import { formatCount, formatPercent } from '@/shared/lib';

export type ConversationCardValue = {
  id: 'sessions' | 'turns' | 'crisis';
  label: string;
  value: string;
  note?: string;
  tone?: 'warning';
};

/** 그래프 한 줄. recharts 가 칸 이름으로 읽도록 위기 수를 펼친다. */
export type ConversationChartRow = {
  date: string;
  sessions: number;
  turns: number;
  keyword: number;
  model: number;
};

export function conversationChartRows(response: ConversationsResponse): ConversationChartRow[] {
  return fillConversationDays(response.daily, response.from, response.to).map((day) => ({
    date: day.date,
    sessions: day.sessions,
    turns: day.turns,
    keyword: day.crisis.keyword,
    model: day.crisis.model,
  }));
}

/** 날짜별 답의 라벨 표 한 줄(표기한 글). 판정이 없는 날의 비율은 대시다. */
export type ReplyLabelRow = {
  date: string;
  generic: string;
  specific: string;
  question: string;
  genericRate: string;
};

export function replyLabelRows(response: ConversationsResponse): ReplyLabelRow[] {
  return fillConversationDays(response.daily, response.from, response.to).map(
    ({ date, replyLabels }) => ({
      date,
      generic: formatCount(replyLabels.generic_comfort),
      specific: formatCount(replyLabels.specific_reflection),
      question: formatCount(replyLabels.question),
      genericRate: formatPercent(genericComfortRate(replyLabels)),
    }),
  );
}

export function hasConversations(rows: readonly ConversationChartRow[]): boolean {
  return rows.some((row) => row.sessions + row.turns + row.keyword + row.model > 0);
}

export function conversationCards(response: ConversationsResponse): ConversationCardValue[] {
  const summary = summarizeConversations(response.daily);
  return [
    { id: 'sessions', label: '새 대화', value: formatCount(summary.sessions) },
    {
      id: 'turns',
      label: '턴',
      value: formatCount(summary.turns),
      note:
        summary.turnsPerSession === null
          ? undefined
          : `대화당 평균 ${summary.turnsPerSession.toFixed(1)}턴`,
    },
    {
      id: 'crisis',
      label: '위기 감지',
      value: formatCount(summary.crisisTotal),
      note: `키워드 ${formatCount(summary.crisis.keyword)} · 모델 판정 ${formatCount(summary.crisis.model)}`,
      tone: summary.crisisTotal > 0 ? 'warning' : undefined,
    },
  ];
}
