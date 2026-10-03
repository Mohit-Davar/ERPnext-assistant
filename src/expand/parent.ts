import type { Database } from '@/index/database.ts';

import type { ParentChunk } from '../chunk/types.ts';
import type { EnrichedChunk } from '../enrich/types.ts';
import type { ExpandedContext } from './types.ts';

interface ChunkRow {
  id: string;
  page_id: string;
  parent_id: string;
  heading: string;
  breadcrumb: string;
  content: string;
  enriched_content: string;
  space: string;
  source_url: string;
  updated: string;
  terms: string | null;
  token_count: number;
  ui_path: string | null;
}

interface ParentRow {
  id: string;
  page_id: string;
  heading: string;
  breadcrumb: string;
  content: string;
  space: string;
  source_url: string;
  updated: string;
}

interface LinkRow {
  to_chunk_id: string | null;
}

function rowToChunk(row: ChunkRow): EnrichedChunk {
  return {
    id: row.id,
    pageId: row.page_id,
    parentId: row.parent_id,
    heading: row.heading,
    breadcrumb: row.breadcrumb,
    content: row.content,
    enrichedContent: row.enriched_content,
    space: row.space,
    sourceUrl: row.source_url,
    updated: row.updated,
    terms: row.terms ? (JSON.parse(row.terms) as string[]) : [],
    tokenCount: row.token_count,
    uiPath: row.ui_path,
  };
}

function rowToParent(row: ParentRow): ParentChunk {
  return {
    id: row.id,
    pageId: row.page_id,
    heading: row.heading,
    breadcrumb: row.breadcrumb,
    content: row.content,
    space: row.space,
    sourceUrl: row.source_url,
    updated: row.updated,
  };
}

/**
 * Fetch the parent section of a child chunk from the database.
 */
export function fetchParent(db: Database, parentId: string): ParentChunk | null {
  const row = db
    .query<ParentRow, [string]>(
      `SELECT id, page_id, heading, breadcrumb, content, space, source_url, updated
       FROM parent_chunks WHERE id = ?`,
    )
    .get(parentId);
  return row ? rowToParent(row) : null;
}

/**
 * Follow one documentation link hop: find the best resolved linked chunk.
 * Prefers links where to_chunk_id is known; falls back to first link with to_page_id.
 */
export function fetchLinkedChunk(db: Database, chunkId: string): EnrichedChunk | null {
  // Try resolved chunk link first
  const link = db
    .query<LinkRow, [string]>(
      `SELECT to_chunk_id FROM chunk_links
       WHERE from_chunk_id = ? AND to_chunk_id IS NOT NULL
       LIMIT 1`,
    )
    .get(chunkId);

  if (link?.to_chunk_id) {
    const row = db
      .query<ChunkRow, [string]>(
        `SELECT id, page_id, parent_id, heading, breadcrumb, content,
                enriched_content, space, source_url, updated, terms, token_count, ui_path
         FROM chunks WHERE id = ?`,
      )
      .get(link.to_chunk_id);
    return row ? rowToChunk(row) : null;
  }

  return null;
}

/**
 * Fetch a chunk by ID.
 */
export function fetchChunk(db: Database, chunkId: string): EnrichedChunk | null {
  const row = db
    .query<ChunkRow, [string]>(
      `SELECT id, page_id, parent_id, heading, breadcrumb, content,
              enriched_content, space, source_url, updated, terms, token_count, ui_path
       FROM chunks WHERE id = ?`,
    )
    .get(chunkId);
  return row ? rowToChunk(row) : null;
}
