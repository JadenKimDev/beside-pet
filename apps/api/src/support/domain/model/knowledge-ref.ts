/**
 * knowledge-ref.ts — a reference to a knowledge passage that grounded a reply.
 * A lightweight pointer (not the full chunk) kept on the turn analysis for review.
 */
export interface KnowledgeRef {
  source: string;
  tags: string[];
}
