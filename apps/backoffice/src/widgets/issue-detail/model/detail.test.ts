import { describe, expect, it } from 'vitest';
import type { IssueCard, IssueDetail } from '@/entities/issue';
import { startableIssue } from './detail';

// 지어낸 값이다.
const card: IssueCard = {
  number: 901,
  title: '예시 이슈',
  labels: [{ name: 'docs', color: '0075ca' }],
  updatedAt: '2026-10-01T00:00:00Z',
  state: 'open',
  column: 'Backlog',
  url: 'https://github.com/example/repo/issues/901',
};

const detail: IssueDetail = {
  number: 901,
  title: '예시 이슈',
  state: 'open',
  labels: [
    { name: 'docs', color: '0075ca' },
    { name: 'run:implement', color: 'ededed' },
  ],
  body: '본문',
  url: card.url,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  comments: [],
};

describe('startableIssue', () => {
  it('uses the card before the detail arrives', () => {
    expect(startableIssue(card, null)).toEqual({
      number: 901,
      state: 'open',
      column: 'Backlog',
      labels: card.labels,
    });
  });

  it('takes state and labels from the newer detail and the column from the board card', () => {
    expect(startableIssue(card, { ...detail, state: 'closed' })).toEqual({
      number: 901,
      state: 'closed',
      column: 'Backlog',
      labels: detail.labels,
    });
  });

  it('ignores a detail of another issue', () => {
    expect(startableIssue(card, { ...detail, number: 902 }).labels).toEqual(card.labels);
  });
});
