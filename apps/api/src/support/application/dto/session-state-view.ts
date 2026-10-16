/**
 * session-state-view.ts — compact session state returned by queries and turns.
 */
export interface SessionStateView {
  sessionId: string;
  task: number;
  progress: number;
  supportLevel: number;
  closed: boolean;
  /** Whether the mind report can be viewed (wrapped up with enough progress). */
  reportAvailable: boolean;
}
