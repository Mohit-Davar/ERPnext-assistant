import { reciprocalRankFusion } from '@/retrieve/fusion.ts';
import { keywordSearch } from '@/retrieve/keyword.ts';
import { rerank } from '@/retrieve/reranker.ts';
import type { RerankResult } from '@/retrieve/types.ts';
import { semanticSearch } from '@/retrieve/vector.ts';
import type { Config } from '@/shared/types.ts';
import type { Database } from '@/index/database.ts';

export { keywordSearch } from '@/retrieve/keyword.ts';
export { semanticSearch } from '@/retrieve/vector.ts';
export { reciprocalRankFusion } from '@/retrieve/fusion.ts';
export { rerank } from '@/retrieve/reranker.ts';
export type { RetrievalResult, FusedResult, RerankResult } from '@/retrieve/types.ts';

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
