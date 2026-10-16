/**
 * delete-session.usecase.ts — the user erases one of their conversations.
 * A hard delete: the transcript, its mind report, and the per-turn analyses all
 * go, because someone exercising their right to erasure should not leave a
 * record behind. Later conversations simply inherit from whatever remains — a
 * deleted session can no longer seed continuity or appear in a report.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SessionRepository } from '@/support/domain/port/session.repository';
import { SESSION_REPOSITORY } from '@/support/domain/port/tokens';
import type { DeleteSessionCommand } from './delete-session.command';
import { assertOwner } from './ownership';

@Injectable()
export class DeleteSessionUseCase {
  constructor(@Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository) {}

  async execute(command: DeleteSessionCommand): Promise<void> {
    const session = await this.sessions.findById(command.sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found: ${command.sessionId}`);
    }
    assertOwner(session.ownerId, command.requester);
    await this.sessions.delete(command.sessionId);
  }
}
