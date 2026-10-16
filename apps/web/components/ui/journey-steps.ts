// 진행 표시(디딤돌 네 칸)의 계산. 서버의 task 는 0(처음 인사)부터 5(마무리)까지이고,
// 진행값은 (task-1) 을 0..4 로 자른 것이다(ADR-0005). 화면은 퍼센트 막대 대신 네 칸으로 보인다.

export const JOURNEY_STEPS = 4;

export type StoneState = 'done' | 'now' | 'todo';

/** task 를 0..5 의 정수로 맞춘다. 숫자가 아니면 0(처음 인사)으로 본다. */
function clampTask(task: number): number {
  if (!Number.isFinite(task)) return 0;
  return Math.min(Math.max(Math.floor(task), 0), JOURNEY_STEPS + 1);
}

/** 칸 i(1..4) 는 i < task 면 채움, i == task 면 지금, 나머지는 비움이다. */
export function journeyStones(task: number): StoneState[] {
  const t = clampTask(task);
  return Array.from({ length: JOURNEY_STEPS }, (_, index) => {
    const stone = index + 1;
    if (stone < t) return 'done';
    if (stone === t) return 'now';
    return 'todo';
  });
}

export type JourneyProgress = {
  /** 화면에 보이는 걸음 번호(0..4). "3 / 4" 의 앞 수. */
  step: number;
  /** progressbar 의 aria-valuenow(0..4). */
  valueNow: number;
  /** 목록 카드의 보조 퍼센트(0..100). */
  percent: number;
};

export function journeyProgress(task: number): JourneyProgress {
  const t = clampTask(task);
  const valueNow = Math.max(t - 1, 0);
  return {
    step: Math.min(t, JOURNEY_STEPS),
    valueNow,
    percent: (valueNow / JOURNEY_STEPS) * 100,
  };
}
