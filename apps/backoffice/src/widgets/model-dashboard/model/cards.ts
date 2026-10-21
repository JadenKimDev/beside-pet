// 모델 계측의 카드 값(화면 안 6절 "카드"). 숫자 표기는 shared/lib 를 따른다.
import type { Spread, UsageSummary } from '@/entities/metrics';
import { formatCount, formatMs, formatPercent, formatUsd } from '@/shared/lib';

export type StatTone = 'danger' | 'warning';

export type StatCardValue = {
  id: string;
  label: string;
  value: string;
  note?: string;
  tone?: StatTone;
  /** 좁은 화면에서 먼저 보이는 카드. 나머지는 `더 보기` 로 펼친다. */
  primary?: boolean;
};

/** 실패율이 이 값 이상이면 값을 위험 색으로 칠한다. */
const DANGER_FAILURE_RATE = 0.05;

/** 백분위 묶음: 하나면 그 값, 여럿이면 "가장 작은 값–큰 값". */
export function formatSpread(spread: Spread | null): string {
  if (spread === null) return formatMs(null);
  if (spread.min === spread.max) return formatMs(spread.min);
  return `${formatMs(spread.min)}–${formatMs(spread.max)}`;
}

function spreadNote(spread: Spread | null, groups: number): string | undefined {
  if (spread === null || spread.min === spread.max) return undefined;
  return `${groups}개 묶음, 아래 표에서 각각`;
}

export function modelCards(summary: UsageSummary): StatCardValue[] {
  const highFailure = summary.failureRate !== null && summary.failureRate >= DANGER_FAILURE_RATE;
  return [
    { id: 'calls', label: '호출', value: `${formatCount(summary.calls)}회`, primary: true },
    {
      id: 'failure',
      label: '실패율',
      value: formatPercent(summary.failureRate),
      note: `실패 ${formatCount(summary.errors)}회`,
      tone: highFailure ? 'danger' : undefined,
      primary: true,
    },
    { id: 'input', label: '입력 토큰', value: formatCount(summary.inputTokens) },
    { id: 'output', label: '출력 토큰', value: formatCount(summary.outputTokens) },
    {
      id: 'p50',
      label: '응답 시간 p50',
      value: formatSpread(summary.p50Ms),
      note: spreadNote(summary.p50Ms, summary.groups),
      primary: true,
    },
    {
      id: 'p95',
      label: '응답 시간 p95',
      value: formatSpread(summary.p95Ms),
      note: spreadNote(summary.p95Ms, summary.groups),
      primary: true,
    },
    {
      id: 'firstToken',
      label: '첫 글자까지 p50',
      value: formatSpread(summary.firstTokenP50Ms),
      note:
        summary.firstTokenP50Ms === null
          ? '스트리밍 호출 없음'
          : summary.firstTokenP50Ms.min === summary.firstTokenP50Ms.max
            ? undefined
            : '스트리밍 묶음마다, 아래 표에서 각각',
    },
    { id: 'cost', label: '추정 비용', value: formatUsd(summary.costUsd), note: '단가표 기준 추정' },
  ];
}
