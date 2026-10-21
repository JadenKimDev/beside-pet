// 만료 모달의 `datetime-local` 값(로컬 시각, 분까지)과 서버의 ISO 사이.
import { extendExpiry } from '@/entities/account';

export const EXPIRY_QUICK_DAYS = [30, 90, 365] as const;

const pad = (value: number) => String(value).padStart(2, '0');

/** ISO → `YYYY-MM-DDTHH:MM`(로컬). 만료가 없으면 빈 글. */
export function toLocalInput(iso: string | undefined): string {
  if (iso === undefined) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` 값 → ISO. 비었거나 읽을 수 없으면 undefined. */
export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** 빠른 선택: 지금과 지금 만료일 중 늦은 쪽에서 `days` 일 뒤, 입력 칸의 값으로. */
export function quickExpiry(expiresAt: string | undefined, days: number, now: Date = new Date()) {
  return toLocalInput(extendExpiry(expiresAt, days, now));
}
