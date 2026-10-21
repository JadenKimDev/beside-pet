import { describe, expect, it } from 'vitest';
import { canStartImplementation, RUN_IMPLEMENT_LABEL } from './visibility';

// 지어낸 보드의 첫 열. 열 이름은 보드마다 다르다.
const FIRST = 'Todo';

const firstColumnOpen = {
  state: 'open' as const,
  column: FIRST as string | null,
  labels: [{ name: 'docs', color: '0075ca' }],
};

describe('canStartImplementation', () => {
  it('is the run:implement label', () => {
    expect(RUN_IMPLEMENT_LABEL).toBe('run:implement');
  });

  it('shows for an open issue in the first column without the label', () => {
    expect(canStartImplementation(firstColumnOpen, FIRST)).toBe(true);
  });

  it('follows whatever the first column of the board is', () => {
    expect(canStartImplementation({ ...firstColumnOpen, column: 'Backlog' }, 'Backlog')).toBe(true);
    expect(canStartImplementation(firstColumnOpen, 'Backlog')).toBe(false);
  });

  it('hides when the label is already there', () => {
    expect(
      canStartImplementation(
        {
          ...firstColumnOpen,
          labels: [...firstColumnOpen.labels, { name: 'run:implement', color: 'ededed' }],
        },
        FIRST,
      ),
    ).toBe(false);
  });

  it('hides for a closed issue', () => {
    expect(canStartImplementation({ ...firstColumnOpen, state: 'closed' }, FIRST)).toBe(false);
  });

  it.each(['In Progress', 'Done', 'todo', null])(
    'hides outside the first column (%s)',
    (column) => {
      expect(canStartImplementation({ ...firstColumnOpen, column }, FIRST)).toBe(false);
    },
  );

  it('hides when the board has no columns, even for an issue off the board', () => {
    expect(canStartImplementation(firstColumnOpen, null)).toBe(false);
    expect(canStartImplementation({ ...firstColumnOpen, column: null }, null)).toBe(false);
  });
});
