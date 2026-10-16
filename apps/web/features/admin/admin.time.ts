/**
 * features/admin/admin.time.ts — local ↔ absolute-UTC conversion for account expiry.
 * The backend stores and enforces an absolute UTC instant; the browser only converts
 * for the admin's local timezone on input (datetime-local picker) and display.
 * Display follows the app language, not the OS locale, so the console reads in
 * one language throughout.
 */
import type { Locale } from '@/i18n/config';

/** UTC instant → value for an <input type="datetime-local"> in the admin's local timezone. */
export const toLocalInput = (utcIso?: string): string => {
  if (!utcIso) {
    return '';
  }
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** <input type="datetime-local"> value (local) → absolute UTC instant, or undefined when empty. */
export const fromLocalInput = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const d = new Date(value); // datetime-local is interpreted as local time
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** UTC instant → human-readable string in the admin's local timezone, in `locale`. */
export const toLocalDisplay = (utcIso: string | undefined, locale: Locale): string => {
  if (!utcIso) {
    return '—';
  }
  const d = new Date(utcIso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale);
};
