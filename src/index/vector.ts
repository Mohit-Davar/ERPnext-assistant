import type { Database } from '@/index/database.ts';

export interface VectorSearchResult {
  chunkId: string;
  score: number; // cosine similarity
}

/**
 * Serialise a Float32Array to a Buffer for SQLite BLOB storage.
 */
export function vectorToBlob(vector: number[]): Buffer {
  const f32 = new Float32Array(vector);
  return Buffer.from(f32.buffer);
}

/**
 * Deserialise a SQLite BLOB back to a number array.
 */
export function blobToVector(blob: Buffer): number[] {
  const f32 = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  return Array.from(f32);
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Store an embedding for a chunk.
 */
export function storeEmbedding(
  db: Database,
  chunkId: string,
  model: string,
  vector: number[],
): void {
  db.run(`INSERT OR REPLACE INTO embeddings (chunk_id, model, vector) VALUES (?, ?, ?)`, [
    chunkId,
    model,
    vectorToBlob(vector),
  ]);
}

/**
 * Brute-force cosine similarity search over all stored embeddings.
 * For the corpus size (<10k chunks) this is fast enough without a dedicated vector DB.
 */
export function vectorSearch(
  db: Database,
  queryVector: number[],
  limit: number = 40,
): VectorSearchResult[] {
  const rows = db
    .query<{ chunk_id: string; vector: Buffer }, []>(`SELECT chunk_id, vector FROM embeddings`)
    .all();

  const scored = rows
    .map((row) => ({
      chunkId: row.chunk_id,
      score: cosineSimilarity(queryVector, blobToVector(row.vector)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
