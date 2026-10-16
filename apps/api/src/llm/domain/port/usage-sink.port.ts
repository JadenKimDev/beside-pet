/**
 * usage-sink.port.ts — where per-call token/cost records land (out).
 * In-memory first; later a persistent store feeding the ops dashboard.
 */
import type { UsageRecord } from '../model/usage-record';

export interface UsageSink {
  record(usage: UsageRecord): void;
  list(): UsageRecord[];
}
