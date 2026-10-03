import { getEmbedding } from '@/index/embed.ts';
import { vectorSearch } from '@/index/vector.ts';
import type { RetrievalResult } from '@/retrieve/types.ts';
import type { Config } from '@/shared/types.ts';
import type { Database } from '@/index/database.ts';

/**
 * Embed the query and run cosine similarity search over stored embeddings.
 */
export async function semanticSearch(
  db: Database,
  query: string,
  config: Config,
  limit: number = 40,
): Promise<RetrievalResult[]> {
  const queryVector = await getEmbedding(query, config);
  const rows = vectorSearch(db, queryVector, limit);

  return rows.map((r) => ({
    chunkId: r.chunkId,
    score: r.score,
    method: 'vector' as const,
  }));
}
