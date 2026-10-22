// 정지(소프트 삭제)한 계정의 보존 기간. 서버의 `TRASH_RETENTION_MONTHS` 와 같은 뜻이고, 서버는 `deleted_at + interval '3 months'` 로
// 가드하므로 여기도 달력 3개월(UTC, 짧은 달은 그 달의 마지막 날)로 센다. 판정은 서버다(409). 화면의 비활성은 편의다.
import type { AccountRecord } from './types';

export const TRASH_RETENTION_MONTHS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 정지 시각에서 보존 기간이 끝나는 시각(ISO). 그 시각부터 완전 삭제할 수 있다. */
export function purgeableAt(deletedAt: string): string {
  const from = new Date(deletedAt);
  const target = new Date(from.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + TRASH_RETENTION_MONTHS);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  return target.toISOString();
}

/** 완전 삭제까지 남은 날수(하루 미만은 올림). 지났으면 0. */
export function purgeDaysLeft(deletedAt: string, now: Date = new Date()): number {
  const left = new Date(purgeableAt(deletedAt)).getTime() - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/** 정지된 계정이고 정지 시각에서 보존 기간이 지났는가. 정지 시각이 없으면 서버도 막으므로 거짓. */
export function isPurgeable(
  account: Pick<AccountRecord, 'status' | 'deletedAt'>,
  now: Date = new Date(),
): boolean {
  return (
    account.status === 'deleted' &&
    account.deletedAt !== undefined &&
    purgeDaysLeft(account.deletedAt, now) === 0
  );
}
