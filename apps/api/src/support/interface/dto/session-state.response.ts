/**
 * session-state.response.ts — wire shape of a session's state (mirrors SessionStateView).
 */
export class SessionStateResponse {
  sessionId!: string;
  task!: number;
  progress!: number;
  supportLevel!: number;
  closed!: boolean;
  /** Whether the mind report can be viewed (wrapped up with enough progress). */
  reportAvailable!: boolean;
}
