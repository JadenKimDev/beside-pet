/**
 * postgres-session.repository.ts — Postgres implementation of the session port.
 * Saves the aggregate in one transaction: the session row (JSONB) plus its
 * analyses as turn_analyses rows. Analyses are append-only and immutable, so the
 * insert upserts on (session_id, seq) and is idempotent across repeated saves.
 * Restores by loading the row + its ordered analyses and rehydrating the aggregate.
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Session } from '@/support/domain/model/session';
import type { SessionRepository } from '@/support/domain/port/session.repository';
import { SessionEntity } from './session.entity';
import { toAnalysisEntity, toSessionEntity, toSessionSnapshot } from './session.mapper';
import { TurnAnalysisEntity } from './turn-analysis.entity';

@Injectable()
export class PostgresSessionRepository implements SessionRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async save(session: Session): Promise<void> {
    const snapshot = session.snapshot();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(SessionEntity).save(toSessionEntity(snapshot));
      if (snapshot.analyses.length > 0) {
        const rows = snapshot.analyses.map((analysis, seq) =>
          toAnalysisEntity(snapshot.id, seq, analysis),
        );
        await manager.getRepository(TurnAnalysisEntity).upsert(rows, ['sessionId', 'seq']);
      }
    });
  }

  /**
   * Erases the session row and its analyses in one transaction. A hard delete:
   * the user asked for the record to be gone, so nothing is left behind to
   * re-link them to it.
   */
  async delete(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(TurnAnalysisEntity).delete({ sessionId: id });
      await manager.getRepository(SessionEntity).delete({ id });
    });
  }

  async findById(id: string): Promise<Session | undefined> {
    const entity = await this.dataSource.getRepository(SessionEntity).findOne({ where: { id } });
    if (!entity) {
      return undefined;
    }
    const analyses = await this.dataSource
      .getRepository(TurnAnalysisEntity)
      .find({ where: { sessionId: id }, order: { seq: 'ASC' } });
    return Session.rehydrate(toSessionSnapshot(entity, analyses));
  }

  async findByOwner(ownerId: string, limit?: number): Promise<Session[]> {
    const rows = await this.dataSource.getRepository(SessionEntity).find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
      ...(typeof limit === 'number' ? { take: limit } : {}),
    });
    if (rows.length === 0) {
      return [];
    }
    const analyses = await this.dataSource.getRepository(TurnAnalysisEntity).find({
      where: { sessionId: In(rows.map((row) => row.id)) },
      order: { seq: 'ASC' },
    });
    const bySession = new Map<string, TurnAnalysisEntity[]>();
    for (const analysis of analyses) {
      const list = bySession.get(analysis.sessionId) ?? [];
      list.push(analysis);
      bySession.set(analysis.sessionId, list);
    }
    return rows.map((row) =>
      Session.rehydrate(toSessionSnapshot(row, bySession.get(row.id) ?? [])),
    );
  }
}
