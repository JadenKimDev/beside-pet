/**
 * features/report/report.types.ts — 마음 리포트 화면의 단계.
 * `loading` 은 처음 여는 리포트라면 서버가 리포트를 쓰는 동안이다(ADR-0008, 한 번만 쓴다).
 * `notReady` 는 서버가 아직 열지 않은 리포트(닫힘 && 두 번째 걸음 이상이 아님, 서버는 409)다.
 * `empty` 는 이야기가 짧아 서버가 리포트를 쓰지 않은 것(절 배열이 빈 배열, #32)이다. 구역 제목을 그리지 않는다.
 */
export type ReportPhase = 'idle' | 'loading' | 'notReady' | 'failed' | 'empty' | 'ready';
