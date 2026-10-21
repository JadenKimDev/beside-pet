import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SELECTION } from './period';
import { usePeriodStore } from './store';

afterEach(() => {
  usePeriodStore.getState().setSelection(DEFAULT_SELECTION);
});

describe('period store', () => {
  it('starts at the default and is shared through getState', () => {
    expect(usePeriodStore.getState().selection).toEqual(DEFAULT_SELECTION);
  });

  it('keeps the chosen selection', () => {
    usePeriodStore.getState().setSelection({ preset: '30d' });
    expect(usePeriodStore.getState().selection).toEqual({ preset: '30d' });
  });

  it('reads the selection from the address query', () => {
    usePeriodStore.getState().syncFromSearch(new URLSearchParams('from=2026-10-01&to=2026-10-14'));
    expect(usePeriodStore.getState().selection).toEqual({
      preset: 'custom',
      start: '2026-10-01',
      end: '2026-10-14',
    });
  });

  it('keeps the same object when the query means the same selection', () => {
    usePeriodStore.getState().setSelection({ preset: 'today' });
    const before = usePeriodStore.getState().selection;
    usePeriodStore.getState().syncFromSearch(new URLSearchParams('period=today'));
    expect(usePeriodStore.getState().selection).toBe(before);
  });
});
