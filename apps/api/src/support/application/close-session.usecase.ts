/**
 * close-session.usecase.ts — use case for a user-initiated session close.
 * Ending the conversation early (e.g. to start a fresh one) closes the session
 * and builds its closing summary, which also unlocks the mind report.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SessionRepository } from '@/support/domain/port/session.repository';
import { SESSION_REPOSITORY } from '@/support/domain/port/tokens';
import type { CloseSessionCommand } from './close-session.command';
import { assertOwner } from './ownership';
import { SupportOrchestrator } from './support.orchestrator';

@Injectable()
export class CloseSessionUseCase {
  constructor(
    private readonly orchestrator: SupportOrchestrator,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  /** Idempotent: closing an already-closed session is a no-op. */
  async execute(command: CloseSessionCommand): Promise<void> {
    const session = await this.sessions.findById(command.sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found: ${command.sessionId}`);
    }
    assertOwner(session.ownerId, command.requester);
    await this.orchestrator.closeByUser(session);
  }
}
