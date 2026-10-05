import type { ParentChunk } from '@/chunk/types.ts';
import type { ChunkLink, EnrichedChunk } from '@/enrich/types.ts';
import type { Database } from '@/index/database.ts';
import { batchEmbed, getEmbedding } from '@/index/embed.ts';
import { storeEmbedding } from '@/index/vector.ts';
import type { ParsedDocument } from '@/parse/types.ts';
import type { Config } from '@/shared/types.ts';

export { openDatabase } from '@/index/database.ts';
export { bm25Search } from '@/index/keyword.ts';
export { vectorSearch, storeEmbedding } from '@/index/vector.ts';
export { getEmbedding } from '@/index/embed.ts';

/**
 * Index all documents, parent chunks, child chunks, links and embeddings.
 * Runs inside a transaction for speed.
 */
export async function indexAll(
  db: Database,
  pages: ParsedDocument[],
  parents: ParentChunk[],
  chunks: EnrichedChunk[],
  links: ChunkLink[],
  config: Config,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const now = new Date().toISOString();

  const insertPage = db.prepare(
    `INSERT OR REPLACE INTO pages (id, filename, space, title, url, updated, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertParent = db.prepare(
    `INSERT OR REPLACE INTO parent_chunks (id, page_id, heading, breadcrumb, content, space, source_url, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertChunk = db.prepare(
    `INSERT OR REPLACE INTO chunks
       (id, page_id, parent_id, heading, breadcrumb, content, enriched_content, space, source_url, updated, terms, token_count, ui_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertLink = db.prepare(
    `INSERT INTO chunk_links (from_chunk_id, to_page_id, to_anchor, to_chunk_id, href)
     VALUES (?, ?, ?, ?, ?)`,
  );

  // Batch insert everything in one transaction
  const insertAllSync = db.transaction(() => {
    for (const page of pages) {
      insertPage.run(page.id, page.filename, page.space, page.title, page.url, page.updated, now);
    }
    for (const p of parents) {
      insertParent.run(
        p.id,
        p.pageId,
        p.heading,
        p.breadcrumb,
        p.content,
        p.space,
        p.sourceUrl,
        p.updated,
      );
    }
    for (const c of chunks) {
      insertChunk.run(
        c.id,
        c.pageId,
        c.parentId,
        c.heading,
        c.breadcrumb,
        c.content,
        c.enrichedContent,
        c.space,
        c.sourceUrl,
        c.updated,
        JSON.stringify(c.terms),
        c.tokenCount,
        c.uiPath ?? null,
      );
    }
    for (const l of links) {
      insertLink.run(
        l.fromChunkId,
        l.toPageId ?? null,
        l.toAnchor ?? null,
        l.toChunkId ?? null,
        l.href,
      );
    }
  });
  insertAllSync();

  if (onProgress) {
    onProgress(`Generating embeddings for ${chunks.length} chunks...`);
  }
  const texts = chunks.map((c) => c.enrichedContent);
  const embeddings = await getEmbeddingBatchSupport(texts, config, onProgress);

  if (onProgress) {
    onProgress(`Storing ${embeddings.length} embeddings in database...`);
  }
  const insertEmbedSync = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      storeEmbedding(db, chunks[i]!.id, config.embeddingModel, embeddings[i]!);
    }
  });
  insertEmbedSync();

  // Record which model was used
  db.run(`INSERT OR REPLACE INTO embed_meta (key, value) VALUES ('model', ?)`, [
    config.embeddingModel,
  ]);
}

async function getEmbeddingBatchSupport(
  texts: string[],
  config: Config,
  onProgress?: (msg: string) => void,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  return batchEmbed(texts, config, 100, (completed, total) => {
    if (onProgress) {
      onProgress(`Generating embeddings... ${completed}/${total} chunks done`);
    }
  });
}
