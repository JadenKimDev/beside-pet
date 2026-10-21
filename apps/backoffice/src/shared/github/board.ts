import { cached, cacheKeys } from './cache';
import { githubGraphql, githubPages } from './client';
import type { ProjectConfig } from './config';
import { type RestIssue, toLabels } from './mapping';
import { BOARD_COLUMNS, type BoardResponse, type IssueCard } from './types';

/** 보드에서 열을 정하는 필드의 이름. 보드마다 다를 수 있어 여기 한 곳에 둔다. */
export const STATUS_FIELD_NAME = 'Status';

const BOARD_QUERY = `query Board($login: String!, $number: Int!, $statusField: String!, $after: String) {
  user(login: $login) {
    projectV2(number: $number) {
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          fieldValueByName(name: $statusField) {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          content {
            ... on Issue { number repository { nameWithOwner } }
          }
        }
      }
    }
  }
}`;

type BoardItem = {
  fieldValueByName: { name?: string | null } | null;
  content: { number?: number; repository?: { nameWithOwner?: string } } | null;
};

type BoardData = {
  user: {
    projectV2: {
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: (BoardItem | null)[];
      };
    } | null;
  } | null;
};

/** 이 레포 이슈 번호 → 보드의 열 이름. 다른 레포의 카드와 이슈가 아닌 카드는 뺀다. */
async function boardColumns(config: ProjectConfig, token: string): Promise<Map<number, string>> {
  const repo = `${config.owner}/${config.repo}`.toLowerCase();
  const columns = new Map<number, string>();
  let after: string | null = null;
  for (;;) {
    const data: BoardData = await githubGraphql<BoardData>(
      BOARD_QUERY,
      {
        login: config.boardOwner,
        number: config.boardNumber,
        statusField: STATUS_FIELD_NAME,
        after,
      },
      token,
    );
    const items = data.user?.projectV2?.items;
    if (!items) return columns;
    for (const node of items.nodes) {
      const number = node?.content?.number;
      const owner = node?.content?.repository?.nameWithOwner?.toLowerCase();
      const name = node?.fieldValueByName?.name;
      if (typeof number === 'number' && owner === repo && name) columns.set(number, name);
    }
    if (!items.pageInfo.hasNextPage || !items.pageInfo.endCursor) return columns;
    after = items.pageInfo.endCursor;
  }
}

export function loadBoard(config: ProjectConfig, token: string): Promise<BoardResponse> {
  return cached(cacheKeys.board, async () => {
    const [issues, columns] = await Promise.all([
      githubPages<RestIssue>(
        `/repos/${config.owner}/${config.repo}/issues`,
        { state: 'all' },
        token,
      ),
      boardColumns(config, token),
    ]);
    const cards: IssueCard[] = issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        labels: toLabels(issue.labels),
        updatedAt: issue.updated_at,
        state: issue.state,
        column: columns.get(issue.number) ?? null,
        url: issue.html_url,
      }));
    return { columns: BOARD_COLUMNS, cards };
  });
}
