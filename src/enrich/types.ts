import type { ChildChunk } from '../chunk/types.ts';

/** Child chunk after enrichment: context header added, terms extracted */
export interface EnrichedChunk extends ChildChunk {
  /** Full text sent to embedding and BM25 index (header + content) */
  enrichedContent: string;
  /** Exact-match terms extracted from content (DocTypes, field names, etc.) */
  terms: string[];
  /** UI navigation path extracted if present, e.g. "Home > Stock > Material Request" */
  uiPath: string | null;
}

/** A link relationship stored in the database */
export interface ChunkLink {
  fromChunkId: string;
  toPageId: string | null;
  toAnchor: string | null;
  /** Resolved chunk ID if the anchor maps to a known section */
  toChunkId: string | null;
  href: string;
}

export interface ChunkReference {
  id: string;
  pageId: string;
  heading: string;
}
export interface DocumentLink {
  href: string;
  isInternal: boolean;
  anchor: string | null;
}
export type LinkResolver = (fromChunkId: string, links: DocumentLink[]) => ChunkLink[];
