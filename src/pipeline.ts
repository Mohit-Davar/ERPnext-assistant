/**
 * Orchestrates the RAG pipeline.
 *
 * This file only wires stages together; it contains no parsing,
 * chunking, retrieval, prompting, or database logic.
 */

import { generateAnswer, generateAnswerStream, streamAnswer } from '@/answer/index.ts';
import type { Answer, Citation } from '@/answer/types.ts';
import { chunkDocuments } from '@/chunk/index.ts';
import { enrichChunks } from '@/enrich/index.ts';
import { expandResults } from '@/expand/index.ts';
import { indexAll, openDatabase } from '@/index/index.ts';
import { filterChanged, loadDocuments, loadManifest, saveManifest } from '@/load/index.ts';
import { parseDocuments } from '@/parse/index.ts';
import { hybridRetrieve } from '@/retrieve/index.ts';
import { loadConfig } from '@/shared/config.ts';
import type { ChunkRow } from '@/shared/types.ts';

export const config = loadConfig();

export {
  hybridRetrieve,
  expandResults,
  generateAnswer,
  generateAnswerStream,
  streamAnswer,
  openDatabase,
};

export interface IngestResult {
  unchanged: number;
  changed: number;
  parsed: number;
  parents: number;
  children: number;
  enriched: number;
  links: number;
}

// Ingest
export async function ingest(onProgress?: (msg: string) => void): Promise<IngestResult> {
  const log = onProgress ?? (() => {});

  log('Loading manifest and documents...');
  // 1. Load
  const manifest = await loadManifest(config.docsDir);
  const allDocs = await loadDocuments(config.docsDir);
  const { changed, unchanged } = filterChanged(allDocs, manifest.entries);
  if (changed.length === 0) {
    return {
      unchanged: unchanged.length,
      changed: 0,
      parsed: 0,
      parents: 0,
      children: 0,
      enriched: 0,
      links: 0,
    };
  }

  log(`Parsing ${changed.length} documents...`);
  // 2. Parse
  const parsed = parseDocuments(changed);

  log(`Chunking documents...`);
  // 3. Chunk
  const { parents, children } = chunkDocuments(parsed);

  log(`Enriching ${children.length} chunks...`);
  // 4. Enrich
  const { enrichedChunks, links } = enrichChunks(children, parsed);

  log('Indexing documents, chunks, and links...');
  // 5. Index
  const db = openDatabase(config.dbPath);
  await indexAll(db, parsed, parents, enrichedChunks, links, config, onProgress);

  log('Updating manifest...');
  // Update manifest
  const now = new Date().toISOString();
  for (const doc of changed) {
    manifest.entries[doc.id] = {
      url: parsed.find((p) => p.id === doc.id)?.url ?? '',
      filename: doc.filename,
      space: doc.space,
      status: 'ok',
      contentHash: doc.contentHash,
      updated: parsed.find((p) => p.id === doc.id)?.updated ?? '',
      lastFetched: now,
    };
  }
  await saveManifest(config.docsDir, manifest);

  return {
    unchanged: unchanged.length,
    changed: changed.length,
    parsed: parsed.length,
    parents: parents.length,
    children: children.length,
    enriched: enrichedChunks.length,
    links: links.length,
  };
}

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
  const reranked = await hybridRetrieve(db, question, config, 15);
  const contexts = expandResults(db, reranked);
  return yield* generateAnswerStream(question, contexts, config, history);
}

/**
 * Synchronous / resolved answer retrieval.
 */
export async function ask(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<Answer> {
  const db = openDatabase(config.dbPath);
  const reranked = await hybridRetrieve(db, question, config, 15);
  const contexts = expandResults(db, reranked);
  return generateAnswer(question, contexts, config, history);
}
