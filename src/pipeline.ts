/**
 * Orchestrates the RAG pipeline.
 *
 * This file only wires stages together; it contains no parsing,
 * chunking, retrieval, prompting, or database logic.
 */

import { generateAnswerStream } from '@/answer/index.ts';
import type { Answer } from '@/answer/types.ts';
import { expandResults } from '@/expand/index.ts';
import { openDatabase } from '@/index/index.ts';
import { buildRetrievalQuery, hybridRetrieve } from '@/retrieve/index.ts';
import { loadConfig } from '@/shared/config.ts';

export const config = loadConfig();

export { hybridRetrieve, expandResults, openDatabase };

export interface SearchResult {
  chunkId: string;
  heading: string;
  breadcrumb: string;
  rerankScore: number;
  source_url: string;
  space: string;
  content: string;
  ui_path?: string | null;
}

// Search
export async function search(query: string, topK = 10): Promise<SearchResult[]> {
  const db = openDatabase(config.dbPath);

  const results = await hybridRetrieve(db, query, config, topK);
  return results.map((r) => {
    const row = db
      .query<
        {
          heading: string;
          breadcrumb: string;
          source_url: string;
          space: string;
          content: string;
          ui_path: string | null;
        },
        [string]
      >(`SELECT heading, breadcrumb, source_url, space, content, ui_path FROM chunks WHERE id = ?`)
      .get(r.chunkId);

    return {
      chunkId: r.chunkId,
      heading: row?.heading ?? r.chunkId,
      breadcrumb: row?.breadcrumb ?? r.chunkId,
      rerankScore: r.rerankScore,
      source_url: row?.source_url ?? '',
      space: row?.space ?? '',
      content: row?.content ?? '',
      ui_path: row?.ui_path,
    };
  });
}

/**
 * Stream an answer. Yields text deltas while the LLM generates, then
 * returns the fully resolved Answer as the generator return value.
 */
export async function* askStream(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): AsyncGenerator<string, Answer> {
  const db = openDatabase(config.dbPath);
  const retrievalQuery = buildRetrievalQuery(question, history);
  const reranked = await hybridRetrieve(db, retrievalQuery, config, 15);
  const contexts = expandResults(db, reranked);
  return yield* generateAnswerStream(question, contexts, config, history);
}
