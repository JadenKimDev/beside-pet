// 테스트 픽스처. 수치는 모두 지어낸 값이다.
import type { ConversationDay, ConversationsResponse } from '@/entities/metrics';

export function conversationDay(overrides: Partial<ConversationDay>): ConversationDay {
  return {
    date: '2026-10-14',
    sessions: 2,
    turns: 6,
    crisis: { keyword: 0, model: 0 },
    ...overrides,
  };
}

export function conversationsResponse(daily: ConversationDay[]): ConversationsResponse {
  return { from: '2026-10-14T03:00:00.000Z', to: '2026-10-16T03:00:00.000Z', daily };
}
