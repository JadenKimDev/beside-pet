import { describe, expect, it } from 'vitest';
import { hasLabel } from './issue';

describe('hasLabel', () => {
  const issue = {
    labels: [
      { name: 'run:implement', color: 'ededed' },
      { name: 'docs', color: '0075ca' },
    ],
  };

  it('finds a label by its exact name', () => {
    expect(hasLabel(issue, 'run:implement')).toBe(true);
    expect(hasLabel(issue, 'docs')).toBe(true);
  });

  it('does not match a different or partial name', () => {
    expect(hasLabel(issue, 'run')).toBe(false);
    expect(hasLabel(issue, 'Run:Implement')).toBe(false);
    expect(hasLabel({ labels: [] }, 'run:implement')).toBe(false);
  });
});
