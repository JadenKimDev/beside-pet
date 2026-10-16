/**
 * session.mapper.ts — converts between the SessionSnapshot (domain boundary) and
 * the persistence rows: one SessionEntity (JSONB document) plus one
 * TurnAnalysisEntity per analysis. The analyses are decomposed into queryable
 * columns on the way out and recomposed into TurnAnalysis on the way back.
 */
import type { SessionSnapshot } from '@/support/domain/model/session-snapshot';
import type { TurnAnalysis } from '@/support/domain/model/turn-analysis';
import { SessionEntity } from './session.entity';
import { TurnAnalysisEntity } from './turn-analysis.entity';

/** The session row, excluding analyses (those become turn_analyses rows). */
export const toSessionEntity = (snapshot: SessionSnapshot): SessionEntity => {
  const entity = new SessionEntity();
  entity.id = snapshot.id;
  entity.ownerId = snapshot.ownerId;
  entity.createdAt = new Date(snapshot.startedAt);
  entity.task = snapshot.task;
  entity.retryCount = snapshot.retryCount;
  entity.supportLevel = snapshot.supportLevel;
  entity.closed = snapshot.closed;
  entity.griefProfile = snapshot.griefProfile;
  entity.history = [...snapshot.history];
  entity.plan = snapshot.plan;
  entity.summary = snapshot.summary;
  entity.report = snapshot.report;
  return entity;
};

export const toAnalysisEntity = (
  sessionId: string,
  seq: number,
  analysis: TurnAnalysis,
): TurnAnalysisEntity => {
  const entity = new TurnAnalysisEntity();
  entity.sessionId = sessionId;
  entity.seq = seq;
  entity.at = analysis.at;
  entity.task = analysis.task;
  entity.phase = analysis.phase;
  entity.riskLevel = analysis.risk.level;
  entity.riskDetectedBy = analysis.risk.detectedBy;
  entity.fromTask = analysis.transition.from;
  entity.toTask = analysis.transition.to;
  entity.advanced = analysis.transition.advanced;
  entity.retryCount = analysis.transition.retryCount;
  entity.knowledge = analysis.knowledge;
  entity.supervision = analysis.supervision;
  return entity;
};

const toTurnAnalysis = (entity: TurnAnalysisEntity): TurnAnalysis => ({
  at: entity.at,
  task: entity.task,
  phase: entity.phase,
  risk: { level: entity.riskLevel, detectedBy: entity.riskDetectedBy },
  transition: {
    from: entity.fromTask,
    to: entity.toTask,
    advanced: entity.advanced,
    retryCount: entity.retryCount,
  },
  knowledge: entity.knowledge,
  ...(entity.supervision ? { supervision: entity.supervision } : {}),
});

/** Rebuilds the aggregate snapshot from the session row + its (ordered) analyses. */
export const toSessionSnapshot = (
  entity: SessionEntity,
  analyses: TurnAnalysisEntity[],
): SessionSnapshot => ({
  id: entity.id,
  ownerId: entity.ownerId,
  startedAt: entity.createdAt.toISOString(),
  griefProfile: entity.griefProfile,
  task: entity.task,
  retryCount: entity.retryCount,
  supportLevel: entity.supportLevel,
  closed: entity.closed,
  history: [...entity.history],
  plan: entity.plan,
  analyses: analyses.map(toTurnAnalysis),
  summary: entity.summary,
  report: entity.report,
});
