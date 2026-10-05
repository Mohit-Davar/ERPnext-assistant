/** A single retrieval result from vector or BM25 search */
export interface RetrievalResult {
  chunkId: string;
  score: number;
  method: 'vector' | 'bm25' | 'rrf';
}

/** A retrieval result after RRF fusion with chunk content attached */
export interface FusedResult {
  chunkId: string;
  rrfScore: number;
  vectorRank: number | null;
  bm25Rank: number | null;
}

/** Result after the optional reranking pass */
export interface RerankResult {
  chunkId: string;
  /** Score from the reranker (higher = more relevant) */
  rerankScore: number;
  rrfScore: number;
}

export interface ChunkRow {
  id: string;
  enriched_content: string;
}

export interface RetrievalHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}