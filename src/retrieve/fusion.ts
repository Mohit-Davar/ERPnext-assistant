import type { FusedResult, RetrievalResult } from '@/retrieve/types.ts';

/**
 * Combine vector and BM25 results using Reciprocal Rank Fusion (RRF).
 *
 * RRF score = Σ 1 / (k + rank_i)
 * where k=60 is a smoothing constant (standard RRF default).
 *
 * Results are NOT combined by raw score — only by rank position.
 */
export function reciprocalRankFusion(
  vectorResults: RetrievalResult[],
  bm25Results: RetrievalResult[],
  k: number = 60,
): FusedResult[] {
  const scores = new Map<
    string,
    { rrfScore: number; vectorRank: number | null; bm25Rank: number | null }
  >();

  const addRank = (results: RetrievalResult[], method: 'vector' | 'bm25') => {
    results.forEach((r, i) => {
      const rank = i + 1;
      const contribution = 1 / (k + rank);
      const existing = scores.get(r.chunkId);

      if (existing) {
        existing.rrfScore += contribution;
        if (method === 'vector') existing.vectorRank = rank;
        else existing.bm25Rank = rank;
      } else {
        scores.set(r.chunkId, {
          rrfScore: contribution,
          vectorRank: method === 'vector' ? rank : null,
          bm25Rank: method === 'bm25' ? rank : null,
        });
      }
    });
  };

  addRank(vectorResults, 'vector');
  addRank(bm25Results, 'bm25');

  return [...scores.entries()]
    .map(([chunkId, data]) => ({ chunkId, ...data }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}
