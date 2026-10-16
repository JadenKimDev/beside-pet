/**
 * rag.adapter.ts — initial RAG knowledge retrieval implementation (in-memory JSON).
 * Reads rag-knowledge/grief-knowledge.json and returns chunks per task.
 * External boundary: JSON null/missing values are narrowed to concrete types here to keep the undefined discipline.
 * Can later be swapped for pgvector embedding search (the port stays the same).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { TaskId } from '@/support/domain/model/grief-task';
import type { KnowledgePort } from '@/support/domain/port/knowledge.port';
import type { KnowledgeChunk } from '@/support/domain/port/knowledge-chunk';

interface IndexedChunk extends KnowledgeChunk {
  taskId?: TaskId;
}

const KNOWLEDGE_PATH = join(process.cwd(), 'rag-knowledge', 'grief-knowledge.json');

/** JSON.parse returns `any`; this alias pins the boundary to a checkable shape. */
const parseJson: (text: string) => object | null = JSON.parse;

const isTaskId = (value: number): value is TaskId =>
  Number.isInteger(value) && value >= 0 && value <= 5;

const isEntry = (value: object | undefined): value is object =>
  typeof value === 'object' && value !== null;

@Injectable()
export class RagKnowledgeAdapter implements KnowledgePort {
  private readonly logger = new Logger(RagKnowledgeAdapter.name);
  private readonly chunks: IndexedChunk[] = this.load();

  async retrieve(task: TaskId, limit: number): Promise<KnowledgeChunk[]> {
    const matched = this.chunks.filter((chunk) => chunk.taskId === task);
    const pool = matched.length > 0 ? matched : this.chunks;
    return pool.slice(0, limit).map(({ source, content, tags }) => ({ source, content, tags }));
  }

  private load(): IndexedChunk[] {
    try {
      const parsed = parseJson(readFileSync(KNOWLEDGE_PATH, 'utf-8'));
      return this.extractChunks(parsed).map((chunk) => this.normalize(chunk));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unreadable knowledge file';
      this.logger.warn(`Failed to load knowledge base — operating with an empty index: ${reason}`);
      return [];
    }
  }

  private extractChunks(parsed: object | null): object[] {
    if (parsed === null || !('chunks' in parsed)) {
      return [];
    }
    const { chunks } = parsed;
    return Array.isArray(chunks) ? chunks.filter(isEntry) : [];
  }

  private normalize(chunk: object): IndexedChunk {
    return {
      source: 'source' in chunk && typeof chunk.source === 'string' ? chunk.source : '',
      content: 'content' in chunk && typeof chunk.content === 'string' ? chunk.content : '',
      tags:
        'tags' in chunk && Array.isArray(chunk.tags)
          ? chunk.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      taskId:
        'task_id' in chunk && typeof chunk.task_id === 'number' && isTaskId(chunk.task_id)
          ? chunk.task_id
          : undefined,
    };
  }
}
