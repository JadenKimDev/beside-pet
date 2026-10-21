// Route Handler(`/api/github/...`)의 응답 모양. `@/shared/github` 는 서버 전용 코드를 값으로 내보내므로
// 여기서는 타입만 다시 내보낸다(`export type`). 값을 가져오지 않고, 열과 그 차례는 응답의 `columns`(보드의 Status 선택지)를 쓴다.
// `model/client-safe.test.ts` 가 이 슬라이스와 board, start-implementation 에서 이것을 지킨다.
export type {
  AddLabelResponse,
  BoardResponse,
  IssueCard,
  IssueComment,
  IssueDetailResponse as IssueDetail,
  IssueLabel,
  IssueState,
} from '@/shared/github';
