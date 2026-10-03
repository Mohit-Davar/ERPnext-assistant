import type { ChildChunk } from '@/chunk/types.ts';
import { enrichChunksWithLinks } from '@/enrich/context.ts';
import { enrichChunk } from '@/enrich/metadata.ts';
import type { ChunkLink, EnrichedChunk } from '@/enrich/types.ts';
import type { ParsedDocument } from '@/parse/types.ts';

export interface EnrichResult {
  enrichedChunks: EnrichedChunk[];
  links: ChunkLink[];
}

export function enrichChunks(children: ChildChunk[], docs: ParsedDocument[]): EnrichResult {
  const enrichedChunks = children.map(enrichChunk);
  const links = enrichChunksWithLinks(enrichedChunks, docs);
  return { enrichedChunks, links };
}

export type { EnrichedChunk, ChunkLink } from '@/enrich/types.ts';
