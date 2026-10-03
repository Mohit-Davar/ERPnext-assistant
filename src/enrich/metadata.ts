import type { ChildChunk } from '@/chunk/types.ts';
import type { EnrichedChunk } from '@/enrich/types.ts';

/**
 * Build the deterministic context header for a chunk.
 *
 * Format:
 *   [ERPNext]
 *
 *   Material Request > 2. Features > 2.6 Automatically Generate Material Requests
 *
 *   UI Path:
 *   Home > Stock > Material Request
 *
 *   <chunk content>
 */
export function buildContextHeader(chunk: ChildChunk, uiPath: string | null): string {
  const parts: string[] = [];
  // Space label
  parts.push(`[${chunk.space}]`);
  parts.push('');
  // Breadcrumb
  parts.push(chunk.breadcrumb);
  // UI path if found
  if (uiPath) {
    parts.push('');
    parts.push('UI Path:');
    parts.push(uiPath);
  }
  parts.push('');
  parts.push(chunk.content);
  return parts.join('\n');
}

/**
 * Extract a UI navigation path from chunk content.
 *
 * Looks for patterns like:
 *   "Home > Stock > Material Request"
 *   "Go to: Setup > ... "
 */
export function extractUiPath(content: string): string | null {
  // Match "Home > ... > ..." or similar navigation paths
  const patterns = [
    /\bHome\s*>\s*[A-Z][^\n]{5,60}/,
    /(?:Navigate|Go)\s+to[:\s]+([A-Z][^.\n]{5,60})/i,
    /\b(?:from|via)\s+the\s+([A-Z][^.\n]{5,50})\s+module/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match) {
      return (match[1] ?? match[0]).trim();
    }
  }

  return null;
}

/**
 * Extract exact-match ERPNext terms from content.
 * These improve BM25 keyword recall for specific terminology.
 */
export function extractTerms(content: string): string[] {
  const terms = new Set<string>();

  // DocType names: PascalCase words 2+ words long
  const docTypeRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  for (const match of content.matchAll(docTypeRe)) {
    const term = match[1] ?? '';
    if (term.length > 3 && term.length < 60) {
      terms.add(term);
    }
  }

  // Bold field names: **Field Name**
  const boldRe = /\*\*([^*]{2,50})\*\*/g;
  for (const match of content.matchAll(boldRe)) {
    terms.add((match[1] ?? '').trim());
  }

  // Backtick terms (API names, field names, statuses)
  const codeRe = /`([^`]{2,60})`/g;
  for (const match of content.matchAll(codeRe)) {
    const term = (match[1] ?? '').trim();
    // Skip multi-line code snippets
    if (!term.includes('\n')) {
      terms.add(term);
    }
  }

  return [...terms];
}

export function enrichChunk(chunk: ChildChunk): EnrichedChunk {
  const uiPath = extractUiPath(chunk.content);
  const terms = extractTerms(chunk.content);
  const enrichedContent = buildContextHeader(chunk, uiPath);

  return {
    ...chunk,
    enrichedContent,
    terms,
    uiPath,
  };
}
