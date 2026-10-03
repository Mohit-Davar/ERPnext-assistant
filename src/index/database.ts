import { Database } from 'bun:sqlite';

/**
 * Open (or create) the SQLite database and initialise all tables.
 *
 * Tables:
 *   pages        - one row per documentation page
 *   parent_chunks - H2-level sections
 *   chunks       - searchable child chunks (FTS5 shadow)
 *   chunks_fts   - FTS5 virtual table for BM25 keyword search
 *   chunk_links  - link relationships between chunks/pages
 *   embeddings   - float32 vector blobs stored alongside chunks
 *   embed_meta   - which model/version was used
 */
export function openDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrent read performance
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS pages (
      id          TEXT PRIMARY KEY,
      filename    TEXT NOT NULL,
      space       TEXT NOT NULL,
      title       TEXT NOT NULL,
      url         TEXT NOT NULL,
      updated     TEXT,
      indexed_at  TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS parent_chunks (
      id          TEXT PRIMARY KEY,
      page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      heading     TEXT NOT NULL,
      breadcrumb  TEXT NOT NULL,
      content     TEXT NOT NULL,
      space       TEXT NOT NULL,
      source_url  TEXT NOT NULL,
      updated     TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id               TEXT PRIMARY KEY,
      page_id          TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      parent_id        TEXT NOT NULL REFERENCES parent_chunks(id) ON DELETE CASCADE,
      heading          TEXT NOT NULL,
      breadcrumb       TEXT NOT NULL,
      content          TEXT NOT NULL,
      enriched_content TEXT NOT NULL,
      space            TEXT NOT NULL,
      source_url       TEXT NOT NULL,
      updated          TEXT,
      terms            TEXT,   -- JSON array
      token_count      INTEGER,
      ui_path          TEXT
    )
  `);

  // FTS5 table for BM25 keyword search — content table pointing to chunks
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      enriched_content,
      content='chunks',
      content_rowid='rowid',
      tokenize='porter unicode61'
    )
  `);

  // Triggers to keep FTS5 in sync
  db.run(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, enriched_content) VALUES (new.rowid, new.enriched_content);
    END
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, enriched_content) VALUES('delete', old.rowid, old.enriched_content);
    END
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, enriched_content) VALUES('delete', old.rowid, old.enriched_content);
      INSERT INTO chunks_fts(rowid, enriched_content) VALUES (new.rowid, new.enriched_content);
    END
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chunk_links (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      from_chunk_id  TEXT NOT NULL,
      to_page_id     TEXT,
      to_anchor      TEXT,
      to_chunk_id    TEXT,
      href           TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id    TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
      model       TEXT NOT NULL,
      vector      BLOB NOT NULL   -- float32 array serialised as binary
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS embed_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  return db;
}
