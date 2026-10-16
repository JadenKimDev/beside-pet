/**
 * session.ts — support session aggregate root.
 * Owns progress state, support level, and conversation history in one place, and state transitions happen only through methods.
 * Measurable progress (currentTask) and loop prevention (retryCount) are the core invariants of this aggregate.
 * Bound to an account (= the viewer who completed onboarding) via ownerId, providing the basis for ownership guards and per-company access.
 */

import type { Locale } from '@/shared/locale';
import type { GriefProfile } from './grief-profile';
import { FIRST_TASK, type TaskId } from './grief-task';
import { createMessage, type Message, type Role } from './message';
import type { MindReport } from './mind-report';
import { SessionClosedError } from './session-closed.error';
import type { SessionSnapshot } from './session-snapshot';
import type { SessionSummary } from './session-summary';
import { SUPPORT_SAFE, type SupportLevel } from './support-level';
import type { SupportPlan } from './support-plan';
import type { TurnAnalysis } from './turn-analysis';

export class Session {
  private constructor(
    readonly id: string,
    readonly ownerId: string,
    readonly startedAt: string,
    private _griefProfile: GriefProfile,
    private _task: TaskId,
    private _retryCount: number,
    private _supportLevel: SupportLevel,
    private _closed: boolean,
    private readonly _history: Message[],
    private _plan: SupportPlan | undefined,
    private readonly _analyses: TurnAnalysis[],
    private _summary: SessionSummary | undefined,
    private _report: MindReport | undefined,
  ) {}

  /**
   * Starts a new session from the onboarding output (grief profile).
   * A first-time session enters the first support task; a continued session may
   * resume at a later task (where the previous session left off).
   */
  static start(
    id: string,
    ownerId: string,
    griefProfile: GriefProfile,
    startedAt: string,
    startTask: TaskId = FIRST_TASK,
  ): Session {
    return new Session(
      id,
      ownerId,
      startedAt,
      griefProfile,
      startTask,
      0,
      SUPPORT_SAFE,
      false,
      [],
      undefined,
      [],
      undefined,
      undefined,
    );
  }

  /** Restores from the persistence store (snapshot rehydration). */
  static rehydrate(snapshot: SessionSnapshot): Session {
    return new Session(
      snapshot.id,
      snapshot.ownerId,
      snapshot.startedAt,
      snapshot.griefProfile,
      snapshot.task,
      snapshot.retryCount,
      snapshot.supportLevel,
      snapshot.closed,
      [...snapshot.history],
      snapshot.plan,
      [...snapshot.analyses],
      snapshot.summary,
      snapshot.report,
    );
  }

  get griefProfile(): GriefProfile {
    return this._griefProfile;
  }
  get task(): TaskId {
    return this._task;
  }
  get retryCount(): number {
    return this._retryCount;
  }
  get supportLevel(): SupportLevel {
    return this._supportLevel;
  }
  get closed(): boolean {
    return this._closed;
  }
  get history(): readonly Message[] {
    return this._history;
  }
  get plan(): SupportPlan | undefined {
    return this._plan;
  }
  get analyses(): readonly TurnAnalysis[] {
    return this._analyses;
  }
  get summary(): SessionSummary | undefined {
    return this._summary;
  }

  /** Adopts the account-level conversation language (applied from the next turn). */
  adoptPreferredLanguage(language: Locale): void {
    if (this._griefProfile.preferredLanguage !== language) {
      this._griefProfile = { ...this._griefProfile, preferredLanguage: language };
    }
  }

  record(role: Role, text: string, at: string): void {
    this._history.push(createMessage(role, text, this._task, at));
  }

  /** Sets the per-session plan (Planner output, once at the start). */
  setPlan(plan: SupportPlan): void {
    this._plan = plan;
  }

  /** Appends one turn's structured analysis. */
  recordAnalysis(analysis: TurnAnalysis): void {
    this._analyses.push(analysis);
  }

  /** Sets the closing summary (Summarizer output, once at the end). */
  setSummary(summary: SessionSummary): void {
    this._summary = summary;
  }

  advanceTo(task: TaskId): void {
    this._task = task;
    this._retryCount = 0;
  }

  registerRetry(): void {
    this._retryCount += 1;
  }

  raiseSupportLevel(level: SupportLevel): void {
    if (level > this._supportLevel) {
      this._supportLevel = level;
    }
  }

  /** Domain invariant: a closed session accepts no further user turns. */
  assertOpen(): void {
    if (this._closed) {
      throw new SessionClosedError(this.id);
    }
  }

  close(): void {
    this._closed = true;
  }

  /** The mind report, once it has been written. */
  get report(): MindReport | undefined {
    return this._report;
  }

  /**
   * Stores the mind report. Writing it costs a model call, so it is kept with
   * the session and never regenerated — a closed session's reflection is final.
   */
  setReport(report: MindReport): void {
    this._report = report;
  }

  snapshot(): SessionSnapshot {
    return {
      id: this.id,
      ownerId: this.ownerId,
      startedAt: this.startedAt,
      griefProfile: this.griefProfile,
      task: this._task,
      retryCount: this._retryCount,
      supportLevel: this._supportLevel,
      closed: this._closed,
      history: [...this._history],
      plan: this._plan,
      analyses: [...this._analyses],
      summary: this._summary,
      report: this._report,
    };
  }
}
