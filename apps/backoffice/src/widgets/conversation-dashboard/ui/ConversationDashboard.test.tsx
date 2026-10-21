import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { conversationDay, conversationsResponse } from '../model/tests/fixtures';
import { ConversationDashboard } from './ConversationDashboard';

describe('ConversationDashboard', () => {
  it('shows placeholders while the first response is loading', () => {
    expect(renderToStaticMarkup(<ConversationDashboard data={null} loading />)).toContain(
      '불러오고 있어요',
    );
  });

  it('shows the empty state when the period has no conversations', () => {
    const html = renderToStaticMarkup(
      <ConversationDashboard data={conversationsResponse([])} loading={false} />,
    );
    expect(html).toContain('이 기간에는 대화가 없어요.');
  });

  it('draws the daily numbers, with empty days filled, in the screen reader table', () => {
    const data = conversationsResponse([
      conversationDay({ date: '2026-10-14', sessions: 3, crisis: { keyword: 2, model: 1 } }),
    ]);
    const html = renderToStaticMarkup(<ConversationDashboard data={data} loading={false} />);
    expect(html).toContain('날짜는 UTC 기준');
    expect(html).toMatch(/2026-10-14<\/th><td[^>]*>3</);
    expect(html).toMatch(/2026-10-15<\/th><td[^>]*>0</);
  });
});
