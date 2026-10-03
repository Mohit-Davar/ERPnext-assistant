/**
 * Orchestrates the RAG pipeline.
 *
 * This file only wires stages together; it contains no parsing,
 * chunking, retrieval, prompting, or database logic.
 *
 * Commands:
 *   bun run ingest                     → load → parse → chunk → enrich → index
 *   bun run search "question"          → retrieve (keyword+vector+RRF)
 *   bun run ask "question"             → retrieve → expand → answer
 *   bun run evaluate                   → evaluate against golden set
 */

import { streamAnswer } from '@/answer/index.ts';
import type { Answer } from '@/answer/types.ts';
import { chunkDocuments } from '@/chunk/index.ts';
import { enrichChunks } from '@/enrich/index.ts';
import { expandResults } from '@/expand/index.ts';
import { indexAll, openDatabase } from '@/index/index.ts';
import { filterChanged, loadDocuments, loadManifest, saveManifest } from '@/load/index.ts';
import { parseDocuments } from '@/parse/index.ts';
import { hybridRetrieve } from '@/retrieve/index.ts';
import { loadConfig } from '@/shared/config.ts';
import type { ChunkRow } from '@/shared/types.ts';

const config = loadConfig();

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
  breadcrumb: string;
  rerankScore: number;
  source_url: string;
  space: string;
}

// Search
export async function search(query: string): Promise<SearchResult[]> {
  const db = openDatabase(config.dbPath);

  const results = await hybridRetrieve(db, query, config, 8);
  return results.map((r) => {
    const row = db
      .query<ChunkRow, [string]>(`SELECT breadcrumb, source_url, space FROM chunks WHERE id = ?`)
      .get(r.chunkId);

    return {
      chunkId: r.chunkId,
      breadcrumb: row?.breadcrumb ?? r.chunkId,
      rerankScore: r.rerankScore,
      source_url: row?.source_url ?? '',
      space: row?.space ?? '',
    };
  });
}

/**
 * Stream an answer. Yields text deltas while the LLM generates, then
 * returns the fully resolved Answer as the generator return value.
 *
 * Usage in CLI:
 *   const gen = askStream(question);
 *   let step = await gen.next();
 *   while (!step.done) { process.stdout.write(step.value); step = await gen.next(); }
 *   const answer = step.value; // resolved Answer with citations
 */
export async function* askStream(question: string): AsyncGenerator<string, Answer> {
  const db = openDatabase(config.dbPath);
  const reranked = await hybridRetrieve(db, question, config, 15);
  const contexts = expandResults(db, reranked);
  return yield* streamAnswer(question, contexts, config);
}
