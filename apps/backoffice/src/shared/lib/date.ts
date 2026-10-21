// 서버는 날짜를 UTC 로 묶는다(계측의 `date`). 날짜 키도 UTC 의 달력 날짜로 맞춘다.

const DAY_MS = 24 * 60 * 60 * 1000;

export type Period = { from: string; to: string };

function parse(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid date: ${iso}`);
  return date;
}

/** ISO 시각 → UTC 의 `YYYY-MM-DD`. */
export function toDateKey(iso: string): string {
  return parse(iso).toISOString().slice(0, 10);
}

/** `now` 에서 끝나고 `days` 일 앞에서 시작하는 기간(ISO). */
export function lastDays(days: number, now: Date = new Date()): Period {
  if (!Number.isInteger(days) || days <= 0)
    throw new Error(`days must be a positive integer: ${days}`);
  return {
    from: new Date(now.getTime() - days * DAY_MS).toISOString(),
    to: now.toISOString(),
  };
}

/** `from` 의 날짜부터 `to` 의 날짜까지(둘 다 포함) UTC 날짜 키. 그래프의 빈 날을 채울 때 쓴다. */
export function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  const last = parse(toDateKey(to)).getTime();
  for (let t = parse(toDateKey(from)).getTime(); t <= last; t += DAY_MS) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}
