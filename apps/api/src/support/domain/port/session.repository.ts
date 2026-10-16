/**
 * session.repository.ts — session persistence port (out).
 * The initial implementation is in-memory; the domain/application stays unchanged even when swapped for Postgres later.
 */
import type { Session } from '../model/session';

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: string): Promise<Session | undefined>;
  /** The owner's sessions, newest first (for the session list + cross-session continuity). */
  findByOwner(ownerId: string, limit?: number): Promise<Session[]>;
  /** Erases a session and everything derived from it. Irreversible by design. */
  delete(id: string): Promise<void>;
}
