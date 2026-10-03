import type { Database } from '@/index/database.ts';

import type { RerankResult } from '../retrieve/types.ts';
import { fetchChunk, fetchLinkedChunk, fetchParent } from './parent.ts';
import type { ExpandedContext } from './types.ts';

export { fetchChunk, fetchParent, fetchLinkedChunk } from './parent.ts';
export type { ExpandedContext } from './types.ts';

const MAX_EXPANDED = 12;

/**
 * Expand reranked results with parent sections and one link hop.
 *
 * Rules:
 * - Always attach the parent section of each retrieved child chunk.
 * - Follow at most one documentation link per chunk.
 * - Deduplicate chunks by ID before returning.
 * - Cap the total number of expanded contexts.
 */
export function expandResults(
  db: Database,
  reranked: RerankResult[],
  limit: number = MAX_EXPANDED,
): ExpandedContext[] {
  const seen = new Set<string>();
  const contexts: ExpandedContext[] = [];

  for (const result of reranked) {
    if (contexts.length >= limit) break;

    const chunk = fetchChunk(db, result.chunkId);
    if (!chunk) continue;
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);

    const parent = fetchParent(db, chunk.parentId);
    const linkedChunk = fetchLinkedChunk(db, chunk.id);

    // Deduplicate linked chunk
    const uniqueLinked = linkedChunk && !seen.has(linkedChunk.id) ? linkedChunk : null;
    if (uniqueLinked) seen.add(uniqueLinked.id);

    contexts.push({ chunk, parent, linkedChunk: uniqueLinked });
  }

  return contexts;
}
