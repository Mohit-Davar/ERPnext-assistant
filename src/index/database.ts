import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface QueryStatement<TRow = unknown, TParams extends any[] = any[]> {
  get(...params: any[]): TRow | null | undefined;
  all(...params: any[]): TRow[];
  run(...params: any[]): { changes: number };
}

export interface Database {
  run(sql: string, params?: any[]): { changes: number };
  query<TRow = unknown, TParams extends any[] = any[]>(sql: string): QueryStatement<TRow, TParams>;
  prepare<TRow = unknown, TParams extends any[] = any[]>(
    sql: string,
  ): QueryStatement<TRow, TParams>;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    space TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    updated TEXT,
    indexed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS parent_chunks (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    heading TEXT NOT NULL,
    breadcrumb TEXT NOT NULL,
    content TEXT NOT NULL,
    space TEXT NOT NULL,
    source_url TEXT NOT NULL,
    updated TEXT
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    parent_id TEXT NOT NULL REFERENCES parent_chunks(id) ON DELETE CASCADE,
    heading TEXT NOT NULL,
    breadcrumb TEXT NOT NULL,
    content TEXT NOT NULL,
    enriched_content TEXT NOT NULL,
    space TEXT NOT NULL,
    source_url TEXT NOT NULL,
    updated TEXT,
    terms TEXT,
    token_count INTEGER NOT NULL,
    ui_path TEXT
  );

  CREATE TABLE IF NOT EXISTS chunk_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    to_page_id TEXT,
    to_anchor TEXT,
    to_chunk_id TEXT REFERENCES chunks(id) ON DELETE CASCADE,
    href TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    vector BLOB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS embed_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_parent_chunks_page_id ON parent_chunks(page_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_page_id ON chunks(page_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_parent_id ON chunks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_chunk_links_from_chunk_id ON chunk_links(from_chunk_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    enriched_content,
    breadcrumb,
    heading,
    content='chunks',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, enriched_content, breadcrumb, heading)
    VALUES (new.rowid, new.enriched_content, new.breadcrumb, new.heading);
  END;

  CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, enriched_content, breadcrumb, heading)
    VALUES ('delete', old.rowid, old.enriched_content, old.breadcrumb, old.heading);
  END;

  CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, enriched_content, breadcrumb, heading)
    VALUES ('delete', old.rowid, old.enriched_content, old.breadcrumb, old.heading);
    INSERT INTO chunks_fts(rowid, enriched_content, breadcrumb, heading)
    VALUES (new.rowid, new.enriched_content, new.breadcrumb, new.heading);
  END;
`;

function wrapStatement<TRow, TParams extends any[] = any[]>(
  statement: ReturnType<DatabaseSync['prepare']>,
): QueryStatement<TRow, TParams> {
  return {
    get: (...params) => statement.get(...params) as TRow | undefined,
    all: (...params) => statement.all(...params) as TRow[],
    run: (...params) => ({ changes: Number(statement.run(...params).changes) }),
  };
}

class SqliteDatabase implements Database {
  constructor(private readonly connection: DatabaseSync) {}

  run(sql: string, params: any[] = []): { changes: number } {
    return { changes: Number(this.connection.prepare(sql).run(...params).changes) };
  }

  query<TRow = unknown, TParams extends any[] = any[]>(sql: string): QueryStatement<TRow, TParams> {
    return wrapStatement<TRow, TParams>(this.connection.prepare(sql));
  }

  prepare<TRow = unknown, TParams extends any[] = any[]>(
    sql: string,
  ): QueryStatement<TRow, TParams> {
    return this.query<TRow, TParams>(sql);
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      this.connection.exec('BEGIN');
      try {
        const result = fn(...args);
        this.connection.exec('COMMIT');
        return result;
      } catch (error) {
        this.connection.exec('ROLLBACK');
        throw error;
      }
    }) as T;
  }
}

const databases = new Map<string, Database>();

export function openDatabase(dbPath: string): Database {
  const absolutePath = resolve(dbPath);
  const existing = databases.get(absolutePath);
  if (existing) {
    return existing;
  }

  mkdirSync(dirname(absolutePath), { recursive: true });
  const connection = new DatabaseSync(absolutePath);
  connection.exec(SCHEMA);
  const database = new SqliteDatabase(connection);
  databases.set(absolutePath, database);
  return database;
}
