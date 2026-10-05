import type { Database } from '@/index/database.ts';
import { reciprocalRankFusion } from '@/retrieve/fusion.ts';
import { keywordSearch } from '@/retrieve/keyword.ts';
import { rerank } from '@/retrieve/reranker.ts';
import type { RerankResult, RetrievalHistoryMessage } from '@/retrieve/types.ts';
import { semanticSearch } from '@/retrieve/vector.ts';
import type { Config } from '@/shared/types.ts';

export { keywordSearch } from '@/retrieve/keyword.ts';
export { semanticSearch } from '@/retrieve/vector.ts';
export { reciprocalRankFusion } from '@/retrieve/fusion.ts';
export { rerank } from '@/retrieve/reranker.ts';
export type { RetrievalResult, FusedResult, RerankResult } from '@/retrieve/types.ts';

/**
 * Recover the prior topic for short detail/clarification follow-ups before retrieval.
 */
export function buildRetrievalQuery(
  question: string,
  history: RetrievalHistoryMessage[] = [],
): string {
  const normalizedQuestion = question.trim().replace(/\s+/g, ' ');
  const isContextualFollowUp =
    /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:tell me|explain|elaborate|expand(?: on)?|go into)\b/i.test(
      normalizedQuestion,
    ) ||
    /^(?:and\s+)?(?:in more detail|more detail|in detail|tell me more|what about it|why is that|how does that work)\??$/i.test(
      normalizedQuestion,
    );

  if (!isContextualFollowUp) {
    return normalizedQuestion;
  }

  const previousUserQuestion = [...history]
    .reverse()
    .find((message) => message.role === 'user')?.content;

  return previousUserQuestion
    ? `${previousUserQuestion}\n${normalizedQuestion}`
    : normalizedQuestion;
}

/**
 * Full hybrid retrieval pipeline:
 *   vector search (top 40) + BM25 search (top 40) → RRF → rerank → top K
 */
export async function hybridRetrieve(
  db: Database,
  query: string,
  config: Config,
  topK: number = 8,
): Promise<RerankResult[]> {
  const [vectorResults, bm25Results] = await Promise.all([
    semanticSearch(db, query, config, 40),
    Promise.resolve(keywordSearch(db, query, 40)),
  ]);

  const fused = reciprocalRankFusion(vectorResults, bm25Results);
  return rerank(db, query, fused, topK, config);
}
