/**
 * generation-result.ts — text + usage of one completed generation call.
 */
import type { UsageRecord } from './usage-record';

export interface GenerationResult {
  text: string;
  usage: UsageRecord;
}
