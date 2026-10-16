/**
 * in-memory-usage.recorder.ts — UsageSink adapter, process-lifetime memory.
 * Enough for local cost inspection; swap for a persistent sink when the ops
 * dashboard lands.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { UsageRecord } from '@/llm/domain/model/usage-record';
import type { UsageSink } from '@/llm/domain/port/usage-sink.port';

@Injectable()
export class InMemoryUsageRecorder implements UsageSink {
  private readonly logger = new Logger(InMemoryUsageRecorder.name);
  private readonly records: UsageRecord[] = [];

  record(usage: UsageRecord): void {
    this.records.push(usage);
    this.logger.debug(
      `${usage.provider}/${usage.model} in=${usage.inputTokens} out=${usage.outputTokens} $${usage.costUsd.toFixed(6)}`,
    );
  }

  list(): UsageRecord[] {
    return [...this.records];
  }
}
