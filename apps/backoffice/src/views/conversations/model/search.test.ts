import { afterEach, describe, expect, it } from 'vitest';
import { usePeriodStore } from '@/features/select-period';
import { ApiError } from '@/shared/api';
import { loadFailed } from './load';
import { conversationsSearch, syncConversationsSearch } from './search';

afterEach(() => {
  usePeriodStore.getState().setSelection({ preset: '7d' });
});

describe('conversations address query', () => {
  it('writes and reads only the period', () => {
    const selection = { preset: 'custom' as const, start: '2026-10-01', end: '2026-10-07' };
    expect(conversationsSearch(selection)).toBe('from=2026-10-01&to=2026-10-07');
    expect(syncConversationsSearch(new URLSearchParams('period=30d&purpose=reply'))).toEqual({
      preset: '30d',
    });
    expect(usePeriodStore.getState().selection).toEqual({ preset: '30d' });
  });

  it('keeps the previous response when a reload fails', () => {
    const before = { data: 'first', loading: true, error: null, periodError: null };
    expect(loadFailed(before, new ApiError(500, 'Internal Server Error'))).toEqual({
      data: 'first',
      loading: false,
      error: '불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      periodError: null,
    });
    expect(loadFailed(before, new ApiError(400, 'to must not be before from')).periodError).toBe(
      'to must not be before from',
    );
  });
});
