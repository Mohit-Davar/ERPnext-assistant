import type { ParentChunk } from '../chunk/types.ts';
import type { EnrichedChunk } from '../enrich/types.ts';

/** A chunk with its parent section and optional linked chunk attached */
export interface ExpandedContext {
  chunk: EnrichedChunk;
  parent: ParentChunk | null;
  /** One hop linked chunk from documentation links */
  linkedChunk: EnrichedChunk | null;
}
