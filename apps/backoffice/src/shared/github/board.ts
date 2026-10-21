import { cached, cacheKeys } from './cache';
import { githubGraphql, githubPages } from './client';
import type { ProjectConfig } from './config';
import { type RestIssue, toLabels } from './mapping';
import type { BoardResponse, IssueCard } from './types';

/** 보드에서 열을 정하는 필드의 이름. 보드마다 다를 수 있어 여기 한 곳에 둔다. */
export const STATUS_FIELD_NAME = 'Status';

const BOARD_QUERY = `query Board($login: String!, $number: Int!, $statusField: String!, $after: String) {
  user(login: $login) {
    projectV2(number: $number) {
      field(name: $statusField) {
        ... on ProjectV2SingleSelectField { options { name } }
      }
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
      field: { options?: { name: string }[] } | null;
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: (BoardItem | null)[];
      };
    } | null;
  } | null;
};

type BoardState = {
  /** Status 필드의 선택지 이름, 보드의 차례대로. 첫 페이지에서 읽는다. */
  columns: string[];
  /** 이 레포 이슈 번호 → 보드의 열 이름. */
  placed: Map<number, string>;
};

/** 보드의 열과 카드의 자리. 다른 레포의 카드와 이슈가 아닌 카드는 뺀다. */
async function boardState(config: ProjectConfig, token: string): Promise<BoardState> {
  const repo = `${config.owner}/${config.repo}`.toLowerCase();
  const placed = new Map<number, string>();
  let columns: string[] | null = null;
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
    const project = data.user?.projectV2;
    columns ??= (project?.field?.options ?? []).map((option) => option.name);
    const items = project?.items;
    if (!items) return { columns, placed };
    for (const node of items.nodes) {
      const number = node?.content?.number;
      const owner = node?.content?.repository?.nameWithOwner?.toLowerCase();
      const name = node?.fieldValueByName?.name;
      if (typeof number === 'number' && owner === repo && name) placed.set(number, name);
    }
    if (!items.pageInfo.hasNextPage || !items.pageInfo.endCursor) return { columns, placed };
    after = items.pageInfo.endCursor;
  }
}

export function loadBoard(config: ProjectConfig, token: string): Promise<BoardResponse> {
  return cached(cacheKeys.board, async () => {
    const [issues, { columns, placed }] = await Promise.all([
      githubPages<RestIssue>(
        `/repos/${config.owner}/${config.repo}/issues`,
        { state: 'all' },
        token,
      ),
      boardState(config, token),
    ]);
    const cards: IssueCard[] = issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        labels: toLabels(issue.labels),
        updatedAt: issue.updated_at,
        state: issue.state,
        column: placed.get(issue.number) ?? null,
        url: issue.html_url,
      }));
    return { columns, cards };
  });
}
