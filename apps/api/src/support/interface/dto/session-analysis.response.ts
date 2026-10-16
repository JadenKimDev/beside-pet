/**
 * session-analysis.response.ts — full analysis surface of one session (mirrors SessionAnalysisView).
 */
import { MessageResponse } from './message.response';
import { SessionSummaryResponse } from './session-summary.response';
import { SupportPlanResponse } from './support-plan.response';
import { TurnAnalysisResponse } from './turn-analysis.response';

export class SessionAnalysisResponse {
  sessionId!: string;
  closed!: boolean;
  plan?: SupportPlanResponse;
  analyses!: TurnAnalysisResponse[];
  summary?: SessionSummaryResponse;
  history!: MessageResponse[];
}
