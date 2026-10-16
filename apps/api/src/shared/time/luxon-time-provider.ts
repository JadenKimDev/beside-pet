/**
 * luxon-time-provider.ts — Luxon-backed TimeProvider. Produces UTC-absolute instants for the whole system.
 */
import { DateTime } from 'luxon';
import type { TimeProvider } from './time-provider';

export class LuxonTimeProvider implements TimeProvider {
  now(): string {
    // toISO() is typed string | null; the ?? keeps the return type a string.
    return DateTime.utc().toISO() ?? new Date().toISOString();
  }

  nowMillis(): number {
    return DateTime.utc().toMillis();
  }
}
