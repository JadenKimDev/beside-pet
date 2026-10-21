import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { INITIAL_LOAD, loadFailed, loadStarted, loadSucceeded } from './load';

describe('model metrics load state', () => {
  it('starts loading without dropping the previous response', () => {
    const ready = loadSucceeded(loadStarted(INITIAL_LOAD), 'first');
    expect(ready).toEqual({ data: 'first', loading: false, error: null, periodError: null });
    expect(loadStarted(ready)).toEqual({ ...ready, loading: true });
  });

  it('puts a 400 on the period picker and keeps the previous response', () => {
    const ready = loadSucceeded(INITIAL_LOAD, 'first');
    const failed = loadFailed(
      loadStarted(ready),
      new ApiError(400, 'Range must be at most 90 days'),
    );
    expect(failed).toEqual({
      data: 'first',
      loading: false,
      error: null,
      periodError: 'Range must be at most 90 days',
    });
  });

  it('shows a general retry message for server and network failures', () => {
    const failed = loadFailed(loadStarted(INITIAL_LOAD), new TypeError('fetch failed'));
    expect(failed.error).toBe('불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    expect(failed.periodError).toBeNull();
    expect(loadFailed(INITIAL_LOAD, new ApiError(503, 'Service Unavailable')).error).toBe(
      '불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    );
  });
});
