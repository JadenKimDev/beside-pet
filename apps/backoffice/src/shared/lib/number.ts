// 수 표기. 값이 없으면(null) 대시를 돌려준다.

const MISSING = '–';

const count = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const subCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** 천 단위 쉼표. */
export function formatCount(value: number | null): string {
  return value === null ? MISSING : count.format(value);
}

/** 1초 아래는 정수 ms, 위는 소수 둘째 자리 초. */
export function formatMs(value: number | null): string {
  if (value === null) return MISSING;
  const ms = Math.round(value);
  return ms < 1000 ? `${ms}ms` : `${(value / 1000).toFixed(2)}s`;
}

/** 분모가 0 이면 null. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** 0..1 비율 → 백분율. */
export function formatPercent(value: number | null, digits = 1): string {
  return value === null ? MISSING : `${(value * 100).toFixed(digits)}%`;
}

/** 1달러 이상은 센트까지, 아래는 넷째 자리까지. */
export function formatUsd(value: number | null): string {
  if (value === null) return MISSING;
  return Math.abs(value) >= 1 || value === 0 ? cents.format(value) : subCents.format(value);
}
