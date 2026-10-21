// "구현 시작" 버튼을 보일 때: Backlog 열의 열린 이슈이고 run:implement 라벨이 아직 없을 때만.
import { hasLabel, type IssueCard } from '@/entities/issue';

/** 개발 자동화의 트리거 라벨. Route Handler 의 허용 목록에 있는 하나뿐인 라벨이다. */
export const RUN_IMPLEMENT_LABEL = 'run:implement';

export const START_COLUMN = 'Backlog';

export type StartableIssue = Pick<IssueCard, 'state' | 'column' | 'labels'>;

export function canStartImplementation(issue: StartableIssue): boolean {
  return (
    issue.state === 'open' && issue.column === START_COLUMN && !hasLabel(issue, RUN_IMPLEMENT_LABEL)
  );
}
