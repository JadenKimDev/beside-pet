/**
 * features/report/report.types.ts — 마음 리포트 화면의 단계.
 * `loading` 은 처음 여는 리포트라면 서버가 리포트를 쓰는 동안이다(ADR-0008, 한 번만 쓴다).
 * `notReady` 는 서버가 아직 열지 않은 리포트(닫힘 && 두 번째 걸음 이상이 아님, 서버는 409)다.
 */
export type ReportPhase = 'idle' | 'loading' | 'notReady' | 'failed' | 'ready';
