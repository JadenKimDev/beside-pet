import { cached, cacheKeys, clearGitHubCache } from './cache';
import { githubJson, githubPages } from './client';
import type { ProjectConfig } from './config';
import { type RestComment, type RestIssue, toComment, toLabels } from './mapping';
import type { AddLabelResponse, IssueDetailResponse } from './types';

/** 화면에서 붙일 수 있는 라벨. 개발 자동화의 트리거 하나뿐이다. */
export const ALLOWED_LABELS: readonly string[] = ['run:implement'];

export function loadIssue(
  config: ProjectConfig,
  token: string,
  number: number,
): Promise<IssueDetailResponse> {
  const base = `/repos/${config.owner}/${config.repo}/issues/${number}`;
  return cached(cacheKeys.issue(number), async () => {
    const [issue, comments] = await Promise.all([
      githubJson<RestIssue>(base, { token }),
      githubPages<RestComment>(`${base}/comments`, {}, token),
    ]);
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: toLabels(issue.labels),
      body: issue.body ?? '',
      url: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      comments: comments.map(toComment),
    };
  });
}

/** 허용 목록의 라벨을 붙이고 캐시를 비운다. 허용 여부는 호출자(handlers)가 먼저 본다. */
export async function addLabel(
  config: ProjectConfig,
  token: string,
  number: number,
  label: string,
): Promise<AddLabelResponse> {
  const labels = await githubJson<RestIssue['labels']>(
    `/repos/${config.owner}/${config.repo}/issues/${number}/labels`,
    { token, method: 'POST', body: { labels: [label] } },
  );
  clearGitHubCache();
  return { labels: toLabels(labels) };
}
