import type { ChunkRow, FusedResult, RerankResult } from '@/retrieve/types.ts';
import type { Config } from '@/shared/types.ts';
import type { Database } from 'bun:sqlite';

interface CohereRerankResponse {
  results: {
    index: number;
    relevance_score: number;
  }[];
}

export async function rerank(
  db: Database,
  query: string,
  fused: FusedResult[],
  topK: number,
  config: Config,
): Promise<RerankResult[]> {
  if (fused.length === 0) {
    return [];
  }

  const ids = fused.map((result) => result.chunkId);
  const placeholders = ids.map(() => '?').join(', ');

  const rows = db
    .query<ChunkRow, string[]>(
      `SELECT id, enriched_content
       FROM chunks
       WHERE id IN (${placeholders})`,
    )
    .all(...ids);

  const contentMap = new Map(rows.map((row) => [row.id, row.enriched_content]));

  const documents = fused.map((result) => contentMap.get(result.chunkId) ?? '');

  if (documents.some((document) => !document)) {
    throw new Error('Missing chunk content for reranking.');
  }

  const response = await fetch('https://api.cohere.com/v2/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cohereApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.rerankModel,
      query,
      documents,
      top_n: topK,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Cohere reranking failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as CohereRerankResponse;

  return data.results.map((result) => {
    const candidate = fused[result.index];

    if (!candidate) {
      throw new Error(`Cohere returned an invalid document index: ${result.index}`);
    }

    return {
      chunkId: candidate.chunkId,
      rerankScore: result.relevance_score,
      rrfScore: candidate.rrfScore,
    };
  });
}
