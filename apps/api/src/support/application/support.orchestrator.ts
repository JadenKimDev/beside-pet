/**
 * support.orchestrator.ts — turn orchestration (explicit orchestrator).
 * Instead of LangGraph, the flow of a single turn is controlled directly in code:
 *   safety check → task transition → knowledge retrieval → empathetic reply → analysis → persistence.
 * Structure (task, progress, support level) is decided by the deterministic domain; only the reply
 * text is filled in by the LLM. Around that, three agents add a layer of analysis:
 *   Planner (once at start) → Supervisor (gated, background QA) → Summarizer (once at close).
 */
import { Inject, Injectable } from '@nestjs/common';
import { crisisReply } from '@/safety/domain/safety-resources';
import type { Locale } from '@/shared/locale';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { petNameOf, preferredLanguageOf } from '@/support/domain/model/grief-profile';
import { isClosingTask, nextTask, type TaskId } from '@/support/domain/model/grief-task';
import type { KnowledgeRef } from '@/support/domain/model/knowledge-ref';
import type { Progression } from '@/support/domain/model/progression';
import type { ReplyPhaseName } from '@/support/domain/model/reply-phase';
import type { RiskAssessment } from '@/support/domain/model/risk-assessment';
import type { Session } from '@/support/domain/model/session';
import {
  isCrisis,
  SUPPORT_CRISIS,
  SUPPORT_SAFE,
  SUPPORT_WATCH,
  type SupportLevel,
} from '@/support/domain/model/support-level';
import type { TaskTransition } from '@/support/domain/model/task-transition';
import type { TurnAnalysis } from '@/support/domain/model/turn-analysis';
import type { KnowledgePort } from '@/support/domain/port/knowledge.port';
import type { KnowledgeChunk } from '@/support/domain/port/knowledge-chunk';
import type { LlmPort } from '@/support/domain/port/llm.port';
import type { PreviousSessionContext, ReplyContext } from '@/support/domain/port/reply-context';
import type { SessionRepository } from '@/support/domain/port/session.repository';
import { KNOWLEDGE_PORT, LLM_PORT, SESSION_REPOSITORY } from '@/support/domain/port/tokens';
import { SafetyCheckService } from '@/support/domain/service/safety-check.service';
import { TaskProgressionService } from '@/support/domain/service/task-progression.service';
import { PlannerAgent } from './agent/planner.agent';
import { SummarizerAgent } from './agent/summarizer.agent';
import { SupervisorAgent } from './agent/supervisor.agent';
import { type TurnEvent, toDoneEvent, toMetaEvent } from './dto/turn-event';
import { type TurnResult, toTurnResult } from './dto/turn-result';

const KNOWLEDGE_LIMIT = 2;

/** Everything one finished turn needs to produce its TurnAnalysis. */
interface TurnRecord {
  phase: ReplyPhaseName;
  from: TaskId;
  to: TaskId;
  advanced: boolean;
  level: SupportLevel;
  knowledge: KnowledgeChunk[];
  reply: string;
}

@Injectable()
export class SupportOrchestrator {
  constructor(
    private readonly safety: SafetyCheckService,
    private readonly progression: TaskProgressionService,
    private readonly planner: PlannerAgent,
    private readonly supervisor: SupervisorAgent,
    private readonly summarizer: SummarizerAgent,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(KNOWLEDGE_PORT) private readonly knowledge: KnowledgePort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  /** First greeting turn (immediately after the session starts). */
  async greet(
    session: Session,
    resuming = false,
    previous?: PreviousSessionContext,
  ): Promise<TurnResult> {
    const locale = preferredLanguageOf(session.griefProfile);
    this.ensurePlan(session);
    const knowledge = await this.knowledgeFor(session.task);
    const reply = await this.compose(
      session,
      resuming ? 'resume' : 'intro',
      locale,
      knowledge,
      undefined,
      previous,
    );
    session.record('assistant', reply, this.time.now());
    await this.sessions.save(session);
    return toTurnResult(session, reply);
  }

  /** Handle one user turn. */
  async handle(session: Session, text: string): Promise<TurnResult> {
    const locale = preferredLanguageOf(session.griefProfile);
    session.record('user', text, this.time.now());

    // 1) Safety first — on a crisis, immediately hand off with a fixed reply and close.
    const level = await this.riskLevel(text);
    session.raiseSupportLevel(level);
    if (isCrisis(level)) {
      const fromTask = session.task;
      const reply = crisisReply();
      session.close();
      session.record('assistant', reply, this.time.now());
      this.recordTurn(session, crisisRecord(fromTask, level, reply));
      this.summarize(session);
      await this.sessions.save(session);
      return toTurnResult(session, reply);
    }

    // 2) Task transition (deterministic depth gate).
    const fromTask = session.task;
    const { advanced, lastEngaged } = this.applyProgression(session);
    const knowledge = await this.knowledgeFor(session.task);

    // 3) Close once the closing task is reached.
    if (isClosingTask(session.task)) {
      const reply = await this.compose(session, 'closing', locale, knowledge);
      session.close();
      session.record('assistant', reply, this.time.now());
      this.recordTurn(
        session,
        turnRecord('closing', fromTask, session, advanced, level, knowledge, reply),
      );
      this.summarize(session);
      await this.sessions.save(session);
      return toTurnResult(session, reply);
    }

    // 4) Regular support reply: open a new stage, deepen the current one, or gently re-ask.
    const phase: ReplyPhaseName = advanced ? 'task' : lastEngaged ? 'deepen' : 'retry';
    const reply = await this.compose(session, phase, locale, knowledge, text);
    session.record('assistant', reply, this.time.now());
    this.recordTurn(
      session,
      turnRecord(phase, fromTask, session, advanced, level, knowledge, reply),
    );
    await this.sessions.save(session);
    return toTurnResult(session, reply);
  }

  /** Streaming greeting turn — same flow as greet(), emitted as SSE events. */
  async *greetStream(
    session: Session,
    resuming = false,
    previous?: PreviousSessionContext,
  ): AsyncIterable<TurnEvent> {
    const locale = preferredLanguageOf(session.griefProfile);
    this.ensurePlan(session);
    const knowledge = await this.knowledgeFor(session.task);
    yield toMetaEvent(session);
    const phase: ReplyPhaseName = resuming ? 'resume' : 'intro';
    const reply = yield* this.streamReplyTokens(
      session,
      phase,
      locale,
      knowledge,
      undefined,
      previous,
    );
    session.record('assistant', reply, this.time.now());
    await this.sessions.save(session);
    yield toDoneEvent(session, reply);
  }

  /** Streaming user turn — same decisions as handle(), emitted as SSE events. */
  async *handleStream(session: Session, text: string): AsyncIterable<TurnEvent> {
    const locale = preferredLanguageOf(session.griefProfile);
    session.record('user', text, this.time.now());

    // 1) Safety first — a crisis hands off with a fixed reply and closes.
    const level = await this.riskLevel(text);
    session.raiseSupportLevel(level);
    if (isCrisis(level)) {
      const fromTask = session.task;
      const reply = crisisReply();
      session.close();
      yield toMetaEvent(session);
      yield { kind: 'token', text: reply };
      session.record('assistant', reply, this.time.now());
      this.recordTurn(session, crisisRecord(fromTask, level, reply));
      this.summarize(session);
      await this.sessions.save(session);
      yield toDoneEvent(session, reply);
      return;
    }

    // 2) Task transition (deterministic depth gate).
    const fromTask = session.task;
    const { advanced, lastEngaged } = this.applyProgression(session);
    const knowledge = await this.knowledgeFor(session.task);

    // 3) Close once the closing task is reached.
    const closing = isClosingTask(session.task);
    const phase: ReplyPhaseName = closing
      ? 'closing'
      : advanced
        ? 'task'
        : lastEngaged
          ? 'deepen'
          : 'retry';
    yield toMetaEvent(session);
    const reply = yield* this.streamReplyTokens(session, phase, locale, knowledge, text);
    if (closing) {
      session.close();
    }
    session.record('assistant', reply, this.time.now());
    this.recordTurn(
      session,
      turnRecord(phase, fromTask, session, advanced, level, knowledge, reply),
    );
    if (closing) {
      this.summarize(session);
    }
    await this.sessions.save(session);
    yield toDoneEvent(session, reply);
  }

  /**
   * User-initiated close (ending the conversation, e.g. to start a fresh one).
   * Builds the closing summary so the mind report becomes available. Idempotent.
   */
  async closeByUser(session: Session): Promise<void> {
    if (session.closed) {
      return;
    }
    session.close();
    this.summarize(session);
    await this.sessions.save(session);
  }

  /**
   * Screens one user message for crisis risk. The deterministic keyword check is
   * a fast path; when it doesn't flag, the LLM does a language-agnostic
   * assessment so non-Korean crisis signals are still caught.
   * Union semantics — either one flags → crisis (safety favors false positives).
   */
  private async riskLevel(text: string): Promise<SupportLevel> {
    if (isCrisis(this.safety.check(text))) {
      return SUPPORT_CRISIS;
    }
    return (await this.llm.assessRisk(text)) ? SUPPORT_CRISIS : SUPPORT_SAFE;
  }

  /**
   * Applies the deterministic depth gate. Derives the answers given within the
   * current stage from the transcript (the user message for this turn is already
   * recorded), so no extra counter has to be persisted.
   */
  private applyProgression(session: Session): Progression {
    const answersInStage = session.history
      .filter((message) => message.role === 'user' && message.task === session.task)
      .map((message) => message.text);
    const step = this.progression.evaluate(answersInStage);
    if (step.advanced) {
      session.advanceTo(nextTask(session.task));
    } else {
      session.registerRetry();
    }
    return step;
  }

  /** Streams reply tokens (yielding TokenEvents) and returns the assembled reply. */
  private async *streamReplyTokens(
    session: Session,
    phase: ReplyPhaseName,
    locale: Locale,
    knowledge: KnowledgeChunk[],
    userText?: string,
    previous?: PreviousSessionContext,
  ): AsyncGenerator<TurnEvent, string> {
    const context = this.replyContext(session, phase, locale, knowledge, userText, previous);
    let reply = '';
    for await (const token of this.llm.streamReply(context)) {
      reply += token;
      yield { kind: 'token', text: token };
    }
    return reply;
  }

  private compose(
    session: Session,
    phase: ReplyPhaseName,
    locale: Locale,
    knowledge: KnowledgeChunk[],
    userText?: string,
    previous?: PreviousSessionContext,
  ): Promise<string> {
    return this.llm.composeReply(
      this.replyContext(session, phase, locale, knowledge, userText, previous),
    );
  }

  private replyContext(
    session: Session,
    phase: ReplyPhaseName,
    locale: Locale,
    knowledge: KnowledgeChunk[],
    userText?: string,
    previous?: PreviousSessionContext,
  ): ReplyContext {
    return {
      phase,
      task: session.task,
      petName: petNameOf(session.griefProfile),
      locale,
      knowledge,
      history: session.history,
      userText,
      previous,
    };
  }

  private knowledgeFor(task: TaskId): Promise<KnowledgeChunk[]> {
    return this.knowledge.retrieve(task, KNOWLEDGE_LIMIT);
  }

  /** Builds the plan once at the start of the session (Planner). */
  private ensurePlan(session: Session): void {
    if (!session.plan) {
      session.setPlan(this.planner.plan(session.griefProfile));
    }
  }

  /** Records the turn's analysis, running the Supervisor only when the gate opens. */
  private recordTurn(session: Session, record: TurnRecord): void {
    const turnIndex = session.analyses.length;
    const risk: RiskAssessment = {
      level: record.level,
      detectedBy: record.level >= SUPPORT_WATCH ? 'keyword' : 'none',
    };
    const transition: TaskTransition = {
      from: record.from,
      to: record.to,
      advanced: record.advanced,
      retryCount: session.retryCount,
    };
    const knowledge: KnowledgeRef[] = record.knowledge.map((chunk) => ({
      source: chunk.source,
      tags: chunk.tags,
    }));
    const analysis: TurnAnalysis = {
      at: this.time.now(),
      task: session.task,
      phase: record.phase,
      risk,
      transition,
      knowledge,
    };
    if (this.supervisor.shouldReview(record.advanced, record.level, turnIndex)) {
      analysis.supervision = this.supervisor.review({
        reply: record.reply,
        task: session.task,
        phase: record.phase,
        level: record.level,
      });
    }
    session.recordAnalysis(analysis);
  }

  /** Builds the closing summary once (Summarizer). */
  private summarize(session: Session): void {
    if (!session.summary) {
      session.setSummary(this.summarizer.summarize(session));
    }
  }
}

/** A normal/closing turn record (task changed by the transition). */
function turnRecord(
  phase: ReplyPhaseName,
  from: TaskId,
  session: Session,
  advanced: boolean,
  level: SupportLevel,
  knowledge: KnowledgeChunk[],
  reply: string,
): TurnRecord {
  return { phase, from, to: session.task, advanced, level, knowledge, reply };
}

/** A crisis turn record (no transition; fixed reply; no knowledge). */
function crisisRecord(from: TaskId, level: SupportLevel, reply: string): TurnRecord {
  return { phase: 'closing', from, to: from, advanced: false, level, knowledge: [], reply };
}
