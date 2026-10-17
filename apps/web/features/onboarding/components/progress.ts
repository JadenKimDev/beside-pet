/**
 * 진행 표시의 계산. 스토어의 단계는 일곱 칸이지만(이별의 사정과 지금의 상황이 따로 있다)
 * 한 사람이 받는 질문은 여섯이다: 1 언어, 2 이름, 3 갈래, 4 함께한 시간, 5 사정 또는 상황, 6 잠.
 * 스토어의 순서(onboarding.store.ts 의 STEPS)가 바뀌면 이 표도 함께 바뀐다.
 */
export const QUESTION_TOTAL = 6;

/** 스토어 단계 번호(0부터) → 화면의 질문 번호(1부터). 4(사정)와 5(상황)는 둘 다 5번째다. */
export const questionNumber = (stepIndex: number): number =>
  Math.min(stepIndex <= 4 ? stepIndex + 1 : stepIndex, QUESTION_TOTAL);

/** 삽화가 갈래의 그림으로 바뀌는가: 갈래 질문(단계 2)을 지난 뒤부터. */
export const PATH_STEP_INDEX = 2;
export const pathDecided = (stepIndex: number, done: boolean): boolean =>
  done || stepIndex > PATH_STEP_INDEX;
