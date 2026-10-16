/**
 * turn-analysis.entity.ts — TypeORM persistence model for one turn's analysis.
 * This is the table that exists for the *second-order* product value: insight.
 * The fields a company would aggregate over (risk level, task reached, advance)
 * are promoted to real columns + indexes so crisis rate, task-reach funnels, etc.
 * are plain SQL GROUP BY. Lower-aggregation detail stays as JSONB.
 * Keyed by (session_id, seq); rows are append-only and immutable once written.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { isoInstant, nullable } from '@/infrastructure/database/transformers';
import type { TaskId } from '@/support/domain/model/grief-task';
import type { KnowledgeRef } from '@/support/domain/model/knowledge-ref';
import type { ReplyPhaseName } from '@/support/domain/model/reply-phase';
import type { RiskDetector } from '@/support/domain/model/risk-assessment';
import type { Supervision } from '@/support/domain/model/supervision';
import type { SupportLevel } from '@/support/domain/model/support-level';

@Entity('turn_analyses')
export class TurnAnalysisEntity {
  @Index('idx_turn_analyses_session')
  @PrimaryColumn('varchar', { name: 'session_id' })
  sessionId!: string;

  @PrimaryColumn('integer')
  seq!: number;

  @Column('timestamptz', { name: 'at', transformer: isoInstant })
  at!: string;

  @Column('integer')
  task!: TaskId;

  @Column('varchar')
  phase!: ReplyPhaseName;

  @Index('idx_turn_analyses_risk')
  @Column('integer', { name: 'risk_level' })
  riskLevel!: SupportLevel;

  @Column('varchar', { name: 'risk_detected_by' })
  riskDetectedBy!: RiskDetector;

  @Column('integer', { name: 'from_task' })
  fromTask!: TaskId;

  @Index('idx_turn_analyses_to_task')
  @Column('integer', { name: 'to_task' })
  toTask!: TaskId;

  @Column('boolean')
  advanced!: boolean;

  @Column('integer', { name: 'retry_count' })
  retryCount!: number;

  @Column('jsonb')
  knowledge!: KnowledgeRef[];

  @Column('jsonb', { nullable: true, transformer: nullable<Supervision>() })
  supervision?: Supervision;
}
