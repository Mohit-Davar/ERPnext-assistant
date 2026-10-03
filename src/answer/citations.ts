import type { ExpandedContext } from '../expand/types.ts';
import type { Answer, Citation } from './types.ts';

/**
 * Parse [N] citation markers from the answer text and verify each one
 * maps to a context item that was actually provided.
 */
export function extractAndVerifyCitations(
  answerText: string,
  contexts: ExpandedContext[],
): { citations: Citation[]; grounded: boolean } {
  const citationRe = /\[(\d+)\]/g;
  const usedIndices = new Set<number>();
  let match: RegExpExecArray | null;

  while ((match = citationRe.exec(answerText)) !== null) {
    const idx = parseInt(match[1] ?? '0', 10);
    usedIndices.add(idx);
  }

  const citations: Citation[] = [];
  let allValid = true;

  for (const idx of [...usedIndices].sort((a, b) => a - b)) {
    const context = contexts[idx - 1]; // citations are 1-indexed
    if (!context) {
      allValid = false;
      continue;
    }
    citations.push({
      index: idx,
      title: context.chunk.pageId,
      section: context.chunk.breadcrumb,
      url: context.chunk.sourceUrl,
      chunkId: context.chunk.id,
    });
  }

  return { citations, grounded: allValid && usedIndices.size > 0 };
}

/**
 * Check if the answer indicates the documentation was not found.
 */
export function checkNotFound(text: string): boolean {
  return /couldn't find|not found|not covered|no documentation|unable to find/i.test(text);
}
