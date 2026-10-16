/**
 * session-analysis-view.ts — full analysis view: transcript + plan + per-turn
 * analyses + closing summary.
 */
import type { Message } from '@/support/domain/model/message';
import type { SessionSummary } from '@/support/domain/model/session-summary';
import type { SupportPlan } from '@/support/domain/model/support-plan';
import type { TurnAnalysis } from '@/support/domain/model/turn-analysis';

export interface SessionAnalysisView {
  sessionId: string;
  closed: boolean;
  plan?: SupportPlan;
  analyses: TurnAnalysis[];
  summary?: SessionSummary;
  history: Message[];
}
