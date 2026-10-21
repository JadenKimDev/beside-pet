// 계측 API(apps/server/src/metrics/api.rs). 질의는 `from`, `to` 둘뿐이고 다른 칸을 붙이면 서버가 400 을 준다.
// 비운 쪽은 서버의 기본값(`to` 는 지금, `from` 은 `to` 의 7일 전)을 따른다.
import { api, withQuery } from '@/shared/api';
import type { Period } from '@/shared/lib';
import type { ConversationsResponse, ModelsResponse } from '../model/types';

/** 기간 질의. 비운 쪽은 보내지 않는다. */
export type PeriodQuery = Partial<Period>;

const query = (period: PeriodQuery) => ({ from: period.from, to: period.to });

export function fetchModelMetrics(period: PeriodQuery = {}): Promise<ModelsResponse> {
  return api.get<ModelsResponse>(withQuery('/v1/admin/metrics/models', query(period)));
}

export function fetchConversationMetrics(period: PeriodQuery = {}): Promise<ConversationsResponse> {
  return api.get<ConversationsResponse>(
    withQuery('/v1/admin/metrics/conversations', query(period)),
  );
}
