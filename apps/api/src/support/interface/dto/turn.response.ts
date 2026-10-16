/**
 * turn.response.ts — wire shape of one turn (mirrors TurnResult).
 */
export class TurnResponse {
  /** The companion's reply text. */
  reply!: string;
  /** Worden stage, 0 (onboarding) to 5 (closing). */
  task!: number;
  /** Journey progress, 0..1. */
  progress!: number;
  /** Support level, 1 (steady) to 3 (crisis hand-off). */
  supportLevel!: number;
  /** True when the session ended (closed / safety hand-off). */
  done!: boolean;
}
