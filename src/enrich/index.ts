import type { ChildChunk } from '@/chunk/types.ts';
import { enrichChunksWithLinks } from '@/enrich/context.ts';
import { enrichChunk } from '@/enrich/metadata.ts';
import type { ChunkLink, EnrichedChunk } from '@/enrich/types.ts';
import type { ParsedDocument } from '@/parse/types.ts';

export interface EnrichResult {
  enrichedChunks: EnrichedChunk[];
  links: ChunkLink[];
}

/**
 * Enrich all child chunks and resolve their documentation links.
 *
 * This stage only transforms existing data. It does not call the database,
 * embeddings API, or documentation website.
 */
export function enrichChunks(children: ChildChunk[], docs: ParsedDocument[]): EnrichResult {
  // Add searchable context and metadata to every child chunk.
  const enrichedChunks = children.map(enrichChunk);
  // Resolve internal documentation links into page/chunk references.
  const links = enrichChunksWithLinks(enrichedChunks, docs);
  return {
    enrichedChunks,
    links,
  };
}

export type { ChunkLink, EnrichedChunk } from '@/enrich/types.ts';
