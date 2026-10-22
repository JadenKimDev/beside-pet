import { describe, expect, it } from 'vitest';
import { isPurgeable, purgeableAt, purgeDaysLeft, TRASH_RETENTION_MONTHS } from './retention';

describe('purgeableAt', () => {
  it('keeps a soft-deleted account for three calendar months', () => {
    expect(TRASH_RETENTION_MONTHS).toBe(3);
    expect(purgeableAt('2026-10-22T08:00:00.000Z')).toBe('2027-01-22T08:00:00.000Z');
    expect(purgeableAt('2026-07-01T00:00:00.000Z')).toBe('2026-10-01T00:00:00.000Z');
  });

  it('clamps to the last day of a shorter month like the server interval does', () => {
    expect(purgeableAt('2026-11-30T10:00:00.000Z')).toBe('2027-02-28T10:00:00.000Z');
    expect(purgeableAt('2027-11-30T10:00:00.000Z')).toBe('2028-02-29T10:00:00.000Z');
    expect(purgeableAt('2026-05-31T00:00:00.000Z')).toBe('2026-08-31T00:00:00.000Z');
    expect(purgeableAt('2026-03-31T00:00:00.000Z')).toBe('2026-06-30T00:00:00.000Z');
  });
});

describe('purgeDaysLeft', () => {
  const deletedAt = '2026-10-01T00:00:00.000Z'; // 완전 삭제는 2027-01-01T00:00Z 부터

  it('counts whole days left, rounding a part day up', () => {
    expect(purgeDaysLeft(deletedAt, new Date('2026-10-01T00:00:00.000Z'))).toBe(92);
    expect(purgeDaysLeft(deletedAt, new Date('2026-12-31T00:00:00.000Z'))).toBe(1);
    expect(purgeDaysLeft(deletedAt, new Date('2026-12-31T23:59:00.000Z'))).toBe(1);
  });

  it('is zero at or after the retention end', () => {
    expect(purgeDaysLeft(deletedAt, new Date('2027-01-01T00:00:00.000Z'))).toBe(0);
    expect(purgeDaysLeft(deletedAt, new Date('2027-03-01T00:00:00.000Z'))).toBe(0);
  });
});

describe('isPurgeable', () => {
  const now = new Date('2027-01-01T00:00:00.000Z');

  it('needs a soft-deleted account suspended three months ago or more', () => {
    expect(isPurgeable({ status: 'deleted', deletedAt: '2026-10-01T00:00:00.000Z' }, now)).toBe(
      true,
    );
    expect(isPurgeable({ status: 'deleted', deletedAt: '2026-10-01T00:00:00.001Z' }, now)).toBe(
      false,
    );
    expect(isPurgeable({ status: 'deleted', deletedAt: '2026-12-20T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });

  it('is false without a suspension time or for other states', () => {
    expect(isPurgeable({ status: 'deleted' }, now)).toBe(false);
    expect(isPurgeable({ status: 'revoked', deletedAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });
});
