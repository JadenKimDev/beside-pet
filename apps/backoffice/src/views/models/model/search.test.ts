import { afterEach, describe, expect, it } from 'vitest';
import { useBreakdownFilterStore } from '@/features/filter-breakdown';
import { usePeriodStore } from '@/features/select-period';
import {
  hasPeriodSearch,
  modelsSearch,
  readModelsSearch,
  selectionFor,
  syncModelsStores,
} from './search';

afterEach(() => {
  usePeriodStore.getState().setSelection({ preset: '7d' });
  useBreakdownFilterStore.getState().clear();
});

describe('models address query', () => {
  it('writes the period and only the chosen filter fields', () => {
    expect(modelsSearch({ preset: '7d' }, { purpose: 'all', version: 'all' })).toBe('period=7d');
    expect(modelsSearch({ preset: '30d' }, { purpose: 'crisis', version: 'crisis-v1' })).toBe(
      'period=30d&purpose=crisis&version=crisis-v1',
    );
    expect(
      modelsSearch(
        { preset: 'custom', start: '2026-10-01', end: '2026-10-07' },
        {
          purpose: 'all',
          version: 'all',
        },
      ),
    ).toBe('from=2026-10-01&to=2026-10-07');
  });

  it('reads back what it wrote', () => {
    const selection = { preset: 'custom' as const, start: '2026-10-01', end: '2026-10-07' };
    const filter = { purpose: 'report' as const, version: 'report-v2' };
    expect(readModelsSearch(new URLSearchParams(modelsSearch(selection, filter)))).toEqual({
      selection,
      filter,
    });
  });

  it('reads an empty query as seven days and no filter', () => {
    expect(readModelsSearch(new URLSearchParams(''))).toEqual({
      selection: { preset: '7d' },
      filter: { purpose: 'all', version: 'all' },
    });
  });

  it('brings both stores in line with the query', () => {
    syncModelsStores(new URLSearchParams('period=today&purpose=reply'));
    expect(usePeriodStore.getState().selection).toEqual({ preset: 'today' });
    expect(useBreakdownFilterStore.getState().filter).toEqual({ purpose: 'reply', version: 'all' });
  });
});

describe('period carried over from the other screen', () => {
  it('uses the stored period when the address has none, and keeps the store', () => {
    usePeriodStore.getState().setSelection({ preset: '30d' });
    const bare = new URLSearchParams('purpose=crisis');
    expect(hasPeriodSearch(bare)).toBe(false);
    expect(selectionFor(bare, usePeriodStore.getState().selection)).toEqual({ preset: '30d' });
    syncModelsStores(bare);
    expect(usePeriodStore.getState().selection).toEqual({ preset: '30d' });
  });

  it('prefers the address over the store', () => {
    const search = new URLSearchParams('period=today');
    expect(hasPeriodSearch(search)).toBe(true);
    expect(selectionFor(search, { preset: '30d' })).toEqual({ preset: 'today' });
  });
});
