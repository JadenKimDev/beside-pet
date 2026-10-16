/**
 * session-snapshot.ts — plain-data image of the Session aggregate.
 * The persistence shape: repositories store/rehydrate sessions through it.
 */
import type { GriefProfile } from './grief-profile';
import type { TaskId } from './grief-task';
import type { Message } from './message';
import type { MindReport } from './mind-report';
import type { SessionSummary } from './session-summary';
import type { SupportLevel } from './support-level';
import type { SupportPlan } from './support-plan';
import type { TurnAnalysis } from './turn-analysis';

export interface SessionSnapshot {
  id: string;
  ownerId: string;
  /** UTC instant the conversation began. */
  startedAt: string;
  griefProfile: GriefProfile;
  task: TaskId;
  retryCount: number;
  supportLevel: SupportLevel;
  closed: boolean;
  history: Message[];
  plan?: SupportPlan;
  analyses: TurnAnalysis[];
  summary?: SessionSummary;
  /** Written once when first requested, then served from here. */
  report?: MindReport;
}
