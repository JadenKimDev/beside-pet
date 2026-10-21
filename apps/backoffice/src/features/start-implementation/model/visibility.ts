// "구현 시작" 버튼을 보일 때: 보드의 첫 열(Status 선택지의 첫째)에 있는 열린 이슈이고 run:implement 라벨이 아직 없을 때만.
// 열 이름은 보드마다 달라 고정하지 않고 보드 응답의 `columns[0]` 을 받는다.
import { hasLabel, type IssueCard } from '@/entities/issue';

/** 개발 자동화의 트리거 라벨. Route Handler 의 허용 목록에 있는 하나뿐인 라벨이다. */
export const RUN_IMPLEMENT_LABEL = 'run:implement';

export type StartableIssue = Pick<IssueCard, 'state' | 'column' | 'labels'>;

/** `firstColumn` 은 보드의 첫 열 이름이고, 보드에 열이 없으면 `null` 이다. */
export function canStartImplementation(issue: StartableIssue, firstColumn: string | null): boolean {
  return (
    issue.state === 'open' &&
    firstColumn !== null &&
    issue.column === firstColumn &&
    !hasLabel(issue, RUN_IMPLEMENT_LABEL)
  );
}
