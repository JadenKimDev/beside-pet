/**
 * stream-event.ts — internal streaming contract between providers and the router.
 * Providers interleave text chunks with a final usage event; the router yields
 * the text to callers and records the usage.
 */
import type { UsageRecord } from '@/llm/domain/model/usage-record';

export interface TextChunkEvent {
  type: 'text';
  text: string;
}

export interface UsageEvent {
  type: 'usage';
  usage: UsageRecord;
}

export type StreamEvent = TextChunkEvent | UsageEvent;
