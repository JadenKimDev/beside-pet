/**
 * knowledge-chunk.ts — a single retrieved knowledge passage used to ground utterances.
 */
export interface KnowledgeChunk {
  source: string;
  content: string;
  tags: string[];
}
