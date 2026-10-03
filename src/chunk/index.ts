import { createChildren } from '@/chunk/child.ts';
import { splitParents } from '@/chunk/heading.ts';
import type { ChildChunk, ParentChunk } from '@/chunk/types.ts';
import type { ParsedDocument } from '@/parse/types.ts';

export interface ChunkResult {
  parents: ParentChunk[];
  children: ChildChunk[];
}

/**
 * Chunk a parsed document into parent + child chunks.
 */
export function chunkDocument(doc: ParsedDocument): ChunkResult {
  const parents = splitParents(doc);
  const children = parents.flatMap(createChildren);
  return { parents, children };
}

export function chunkDocuments(docs: ParsedDocument[]): ChunkResult {
  const allParents: ParentChunk[] = [];
  const allChildren: ChildChunk[] = [];

  for (const doc of docs) {
    const { parents, children } = chunkDocument(doc);
    allParents.push(...parents);
    allChildren.push(...children);
  }

  return { parents: allParents, children: allChildren };
}
