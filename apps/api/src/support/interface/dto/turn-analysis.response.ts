/**
 * turn-analysis.response.ts — per-turn analysis record (mirrors TurnAnalysis).
 */

import type { TaskId } from '@/support/domain/model/grief-task';
import type { ReplyPhaseName } from '@/support/domain/model/reply-phase';
import { KnowledgeRefResponse } from './knowledge-ref.response';
import { RiskAssessmentResponse } from './risk-assessment.response';
import { SupervisionResponse } from './supervision.response';
import { TaskTransitionResponse } from './task-transition.response';

export class TurnAnalysisResponse {
  at!: string;
  task!: TaskId;
  phase!: ReplyPhaseName;
  risk!: RiskAssessmentResponse;
  transition!: TaskTransitionResponse;
  knowledge!: KnowledgeRefResponse[];
  supervision?: SupervisionResponse;
}
