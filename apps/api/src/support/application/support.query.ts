/**
 * support.query.ts — read-only queries (state, history). Verifies ownership, then returns views only.
 */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { preferredLanguageOf } from '@/support/domain/model/grief-profile';
import { progressOf } from '@/support/domain/model/grief-task';
import type { Message } from '@/support/domain/model/message';
import { isReportAvailable, type MindReport } from '@/support/domain/model/mind-report';
import type { Session } from '@/support/domain/model/session';
import type { SessionRepository } from '@/support/domain/port/session.repository';
import { SESSION_REPOSITORY } from '@/support/domain/port/tokens';
import { MindReportAgent } from './agent/mind-report.agent';
import type { SessionAnalysisView } from './dto/session-analysis-view';
import type { SessionListItem } from './dto/session-list-item';
import type { SessionStateView } from './dto/session-state-view';
import { assertOwner, type Requester } from './ownership';

/** How many recent sessions the list returns. */
const SESSION_LIST_LIMIT = 20;

@Injectable()
export class SupportQuery {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly mindReport: MindReportAgent,
  ) {}

  /** The signed-in owner's sessions, newest first (for the returning-user list). */
  async listForOwner(requester: Requester): Promise<SessionListItem[]> {
    const sessions = await this.sessions.findByOwner(requester.id, SESSION_LIST_LIMIT);
    return sessions.map((session) => ({
      sessionId: session.id,
      startedAt: session.startedAt,
      closed: session.closed,
      reachedTask: session.task,
      progress: progressOf(session.task),
      petName: session.griefProfile.petName,
      preferredLanguage: preferredLanguageOf(session.griefProfile),
      reportAvailable: isReportAvailable(session.task, session.closed),
    }));
  }

  /**
   * User-facing mind report. Written once on first request and kept with the
   * session: the reflection on a closed conversation does not change, and
   * regenerating it would spend a model call on every view.
   */
  async report(id: string, requester: Requester): Promise<MindReport> {
    const session = await this.require(id, requester);
    if (!isReportAvailable(session.task, session.closed)) {
      throw new ConflictException('The report is not available for this session yet.');
    }
    const stored = session.report;
    if (stored) {
      return stored;
    }
    const report = await this.mindReport.build(session);
    session.setReport(report);
    await this.sessions.save(session);
    return report;
  }

  async state(id: string, requester: Requester): Promise<SessionStateView> {
    const session = await this.require(id, requester);
    return {
      sessionId: session.id,
      task: session.task,
      progress: progressOf(session.task),
      supportLevel: session.supportLevel,
      closed: session.closed,
      reportAvailable: isReportAvailable(session.task, session.closed),
    };
  }

  async history(id: string, requester: Requester): Promise<Message[]> {
    const session = await this.require(id, requester);
    return [...session.history];
  }

  async analysis(id: string, requester: Requester): Promise<SessionAnalysisView> {
    const session = await this.require(id, requester);
    return {
      sessionId: session.id,
      closed: session.closed,
      plan: session.plan,
      analyses: [...session.analyses],
      summary: session.summary,
      history: [...session.history],
    };
  }

  private async require(id: string, requester: Requester): Promise<Session> {
    const session = await this.sessions.findById(id);
    if (!session) {
      throw new NotFoundException(`Session not found: ${id}`);
    }
    assertOwner(session.ownerId, requester);
    return session;
  }
}
