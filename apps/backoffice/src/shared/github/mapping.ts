import type { IssueComment, IssueLabel, IssueState } from './types';

/** GitHub REST 의 이슈 중 쓰는 칸. */
export type RestIssue = {
  number: number;
  title: string;
  state: IssueState;
  labels: ({ name?: string; color?: string } | string)[];
  updated_at: string;
  created_at: string;
  html_url: string;
  body: string | null;
  pull_request?: object;
};

export type RestComment = {
  id: number;
  user: { login: string } | null;
  body: string | null;
  created_at: string;
};

export function toLabels(labels: RestIssue['labels']): IssueLabel[] {
  return labels.map((label) =>
    typeof label === 'string'
      ? { name: label, color: '' }
      : { name: label.name ?? '', color: label.color ?? '' },
  );
}

export function toComment(comment: RestComment): IssueComment {
  return {
    id: comment.id,
    author: comment.user?.login ?? null,
    body: comment.body ?? '',
    createdAt: comment.created_at,
  };
}
