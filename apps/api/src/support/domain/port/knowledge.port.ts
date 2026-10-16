/**
 * knowledge.port.ts — RAG knowledge retrieval port (out).
 * Grounds utterances in validated grief theory. Returns chunks per task.
 * The initial implementation is in-memory JSON, later swappable for pgvector.
 */
import type { TaskId } from '../model/grief-task';
import type { KnowledgeChunk } from './knowledge-chunk';

export interface KnowledgePort {
  retrieve(task: TaskId, limit: number): Promise<KnowledgeChunk[]>;
}
