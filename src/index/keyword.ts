import type { BM25Result } from '@/index/types';
import type { Database } from '@/index/database.ts';

/**
 * Run a BM25 full-text search against the chunks_fts table.
 * SQLite FTS5's bm25() function returns negative scores; we negate them.
 */
export function bm25Search(db: Database, query: string, limit: number = 40): BM25Result[] {
  const safeQuery = escapeFts(query);

  const rows = db
    .query<{ chunkId: string; score: number }, [string, number]>(
      `SELECT c.id AS chunkId, -bm25(chunks_fts) AS score
             FROM chunks_fts
             JOIN chunks c ON c.rowid = chunks_fts.rowid
             WHERE chunks_fts MATCH ?
             ORDER BY score DESC
             LIMIT ?`,
    )
    .all(safeQuery, limit);

  return rows;
}

/**
 * Escape FTS5 query syntax to avoid parse errors on user input.
 * Wraps each token in double quotes.
 */
function escapeFts(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(' ');
}
