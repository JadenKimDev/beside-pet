import { describe, expect, it } from 'vitest';
import { canStartImplementation, RUN_IMPLEMENT_LABEL } from './visibility';

const backlogOpen = {
  state: 'open' as const,
  column: 'Backlog' as string | null,
  labels: [{ name: 'docs', color: '0075ca' }],
};

describe('canStartImplementation', () => {
  it('is the run:implement label', () => {
    expect(RUN_IMPLEMENT_LABEL).toBe('run:implement');
  });

  it('shows for an open Backlog issue without the label', () => {
    expect(canStartImplementation(backlogOpen)).toBe(true);
  });

  it('hides when the label is already there', () => {
    expect(
      canStartImplementation({
        ...backlogOpen,
        labels: [...backlogOpen.labels, { name: 'run:implement', color: 'ededed' }],
      }),
    ).toBe(false);
  });

  it('hides for a closed issue', () => {
    expect(canStartImplementation({ ...backlogOpen, state: 'closed' })).toBe(false);
  });

  it.each(['In progress', 'In review', 'Done', 'Todo', 'backlog', null])(
    'hides outside Backlog (%s)',
    (column) => {
      expect(canStartImplementation({ ...backlogOpen, column })).toBe(false);
    },
  );
});
