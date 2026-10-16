/**
 * send-message.usecase.ts — use case for sending one user turn (= a single function).
 * Restores the session, verifies ownership, then delegates to the orchestrator. A missing session raises a domain exception.
 */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';
import type { Session } from '@/support/domain/model/session';
import { SessionClosedError } from '@/support/domain/model/session-closed.error';
import type { SessionRepository } from '@/support/domain/port/session.repository';
import { SESSION_REPOSITORY } from '@/support/domain/port/tokens';
import type { TurnEvent } from './dto/turn-event';
import type { TurnResult } from './dto/turn-result';
import { assertOwner } from './ownership';
import type { SendMessageCommand } from './send-message.command';
import { SupportOrchestrator } from './support.orchestrator';

@Injectable()
export class SendMessageUseCase {
  constructor(
    private readonly orchestrator: SupportOrchestrator,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
  ) {}

  async execute(command: SendMessageCommand): Promise<TurnResult> {
    const session = await this.loadWritableSession(command);
    return this.orchestrator.handle(session, command.text);
  }

  /** Streaming variant — same lookup/ownership checks, turn emitted as SSE events. */
  async *stream(command: SendMessageCommand): AsyncIterable<TurnEvent> {
    const session = await this.loadWritableSession(command);
    yield* this.orchestrator.handleStream(session, command.text);
  }

  /**
   * Restores the session and asserts it can still take a turn: it must exist, be
   * owned by the requester, and be open — the "no turns after close" rule is the
   * Session aggregate's own invariant (assertOpen), translated to HTTP here.
   * The owner's account-level conversation language is adopted here, so a
   * settings change takes effect from the very next turn.
   */
  private async loadWritableSession(command: SendMessageCommand): Promise<Session> {
    const session = await this.sessions.findById(command.sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found: ${command.sessionId}`);
    }
    assertOwner(session.ownerId, command.requester);
    try {
      session.assertOpen();
    } catch (error) {
      if (error instanceof SessionClosedError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    const owner = await this.accounts.findById(session.ownerId);
    if (owner?.chatLanguage) {
      session.adoptPreferredLanguage(owner.chatLanguage);
    }
    return session;
  }
}
