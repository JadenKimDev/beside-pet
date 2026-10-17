// 말풍선 목록의 줄: 날짜가 바뀌는 자리에 날짜 구분, 단계(task)가 오르는 자리에 단계 구분선을 끼운다.
// 단계는 서버가 준 값(meta 의 task, 저장된 대화의 HistoryMessage.task)만 쓰고 웹이 셈하지 않는다.
import type { TaskId } from '@/lib/api';
import type { Message } from './types';

export type TimelineRow =
  | { kind: 'date'; key: string; day: string }
  | { kind: 'stage'; key: string; task: TaskId }
  | { kind: 'message'; key: string; message: Message };

/** 구분선을 그리는 단계: 네 걸음(1..4). 처음 인사(0)와 마무리(5)는 그리지 않는다. */
const isStep = (task: TaskId): boolean => task >= 1 && task <= 4;

/** 그 기기의 달력 날짜(YYYY-MM-DD). 날짜 구분은 사용자가 사는 날을 따른다. */
export function localDay(at: string): string | undefined {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return undefined;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildTimeline(messages: Message[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let lastDay: string | undefined;
  let lastTask: TaskId | undefined;
  for (const message of messages) {
    const day = message.at ? localDay(message.at) : undefined;
    if (day && day !== lastDay) {
      rows.push({ kind: 'date', key: `date-${day}`, day: message.at as string });
      lastDay = day;
    }
    if (message.task !== undefined) {
      if (lastTask !== undefined && message.task > lastTask && isStep(message.task)) {
        rows.push({ kind: 'stage', key: `stage-${message.id}`, task: message.task });
      }
      lastTask = message.task;
    }
    rows.push({ kind: 'message', key: message.id, message });
  }
  return rows;
}
