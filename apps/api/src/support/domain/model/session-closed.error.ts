/**
 * session-closed.error.ts — domain invariant violation: a closed session
 * accepts no further user turns (it ended as a safety hand-off or a finished
 * conversation). Thrown by the Session aggregate; the application layer maps
 * it to an HTTP conflict.
 */
export class SessionClosedError extends Error {
  constructor(sessionId: string) {
    super(`Session is already closed: ${sessionId}`);
    this.name = 'SessionClosedError';
  }
}
