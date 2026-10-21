// 보드 응답의 카드를 열 차례대로 묶는다.
// - 응답의 `columns` 차례로 모든 열을 둔다(카드가 없어도).
// - 알 수 없는 열 이름의 카드는 그 이름 그대로 열을 만들어 아는 열 뒤에 이름 차례로 붙인다.
// - 보드에 없는(`column: null`) 열린 이슈는 맨 뒤 "보드 밖" 묶음에 둔다. 카드가 없으면 묶음도 없다.
// - 보드에 없는 닫힌 이슈는 뺀다.
// 같은 슬라이스 레이어(entities/issue)를 가져올 수 없어 타입은 `@/shared/github` 에서 타입만 가져온다.
import type { BoardResponse, IssueCard } from '@/shared/github';

export type BoardGroup =
  | { kind: 'column'; name: string; cards: IssueCard[] }
  | { kind: 'unknown'; name: string; cards: IssueCard[] }
  | { kind: 'offBoard'; cards: IssueCard[] };

/** 갱신 시각 내림차순, 같으면 번호 내림차순. 새 배열을 돌려준다. */
export function sortCards(cards: readonly IssueCard[]): IssueCard[] {
  return [...cards].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.number - a.number,
  );
}

export function groupByColumn(board: BoardResponse): BoardGroup[] {
  const known = new Set<string>(board.columns);
  const byColumn = new Map<string, IssueCard[]>();
  const offBoard: IssueCard[] = [];

  for (const card of board.cards) {
    if (card.column === null) {
      if (card.state === 'open') offBoard.push(card);
      continue;
    }
    const list = byColumn.get(card.column);
    if (list) list.push(card);
    else byColumn.set(card.column, [card]);
  }

  const cardsOf = (name: string) => sortCards(byColumn.get(name) ?? []);
  const groups: BoardGroup[] = board.columns.map((name) => ({
    kind: 'column',
    name,
    cards: cardsOf(name),
  }));
  const extraNames = [...byColumn.keys()].filter((name) => !known.has(name)).sort();
  for (const name of extraNames) groups.push({ kind: 'unknown', name, cards: cardsOf(name) });
  if (offBoard.length > 0) groups.push({ kind: 'offBoard', cards: sortCards(offBoard) });
  return groups;
}
