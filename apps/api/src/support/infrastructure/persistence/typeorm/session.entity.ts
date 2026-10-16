/**
 * session.entity.ts — TypeORM persistence model for a session aggregate.
 * The conversation-shaped parts (grief profile, transcript, plan, summary) are
 * stored as JSONB — they're read and written as one document, matching the
 * aggregate's snapshot boundary. Per-turn analyses live in their own table
 * (turn_analyses) so they stay queryable for aggregation.
 */
import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { nullable } from '@/infrastructure/database/transformers';
import type { GriefProfile } from '@/support/domain/model/grief-profile';
import type { TaskId } from '@/support/domain/model/grief-task';
import type { Message } from '@/support/domain/model/message';
import type { MindReport } from '@/support/domain/model/mind-report';
import type { SessionSummary } from '@/support/domain/model/session-summary';
import type { SupportLevel } from '@/support/domain/model/support-level';
import type { SupportPlan } from '@/support/domain/model/support-plan';

@Entity('sessions')
export class SessionEntity {
  @PrimaryColumn('varchar')
  id!: string;

  @Index('idx_sessions_owner')
  @Column('varchar', { name: 'owner_id' })
  ownerId!: string;

  @Column('integer')
  task!: TaskId;

  @Column('integer', { name: 'retry_count' })
  retryCount!: number;

  @Column('integer', { name: 'support_level' })
  supportLevel!: SupportLevel;

  @Column('boolean')
  closed!: boolean;

  @Column('jsonb', { name: 'grief_profile' })
  griefProfile!: GriefProfile;

  @Column('jsonb')
  history!: Message[];

  @Column('jsonb', { nullable: true, transformer: nullable<SupportPlan>() })
  plan?: SupportPlan;

  @Column('jsonb', { nullable: true, transformer: nullable<SessionSummary>() })
  summary?: SessionSummary;

  @Column('jsonb', { nullable: true, transformer: nullable<MindReport>() })
  report?: MindReport;

  /** When the conversation began — set by the domain, shown to the user. */
  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
