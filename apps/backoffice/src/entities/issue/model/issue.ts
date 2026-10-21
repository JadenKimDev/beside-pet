import type { IssueLabel } from './types';

/** 라벨 이름이 정확히 같은 것이 있는가. */
export function hasLabel(
  issue: { labels: readonly Pick<IssueLabel, 'name'>[] },
  name: string,
): boolean {
  return issue.labels.some((label) => label.name === name);
}
