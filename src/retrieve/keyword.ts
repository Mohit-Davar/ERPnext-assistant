import { bm25Search } from '@/index/keyword.ts';
import type { RetrievalResult } from '@/retrieve/types.ts';
import type { Database } from 'bun:sqlite';

/**
 * Run BM25 keyword search and return ranked results.
 */
export function keywordSearch(db: Database, query: string, limit: number = 40): RetrievalResult[] {
  const rows = bm25Search(db, query, limit);
  return rows.map((r) => ({
    chunkId: r.chunkId,
    score: r.score,
    method: 'bm25' as const,
  }));
}
