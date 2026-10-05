import type { ChildChunk } from '@/chunk/types.ts';
import type { EnrichedChunk } from '@/enrich/types.ts';

/**
 * Build the deterministic context header for a chunk.
 *
 * Example:
 *
 * [ERPNext]
 *
 * Material Request > 2. Features > 2.6 Automatically Generate Material Requests
 *
 * UI Path:
 * Home > Stock > Material Request
 *
 * <chunk content>
 *
 * This gives the embedding and keyword search more context than the
 * original child content alone.
 */
export function buildContextHeader(chunk: ChildChunk, uiPath: string | null): string {
  const parts: string[] = [];
  // Add the documentation space so the chunk is clearly associated
  // with ERPNext or Frappe documentation.
  parts.push(`[${chunk.space}]`);
  parts.push('');
  // The breadcrumb provides the document hierarchy around this chunk.
  parts.push(chunk.breadcrumb);
  // Add the ERPNext UI location when one can be extracted from the content.
  if (uiPath) {
    parts.push('');
    parts.push('UI Path:');
    parts.push(uiPath);
  }
  // Keep the original chunk content at the end of the enriched context.
  parts.push('');
  parts.push(chunk.content);
  return parts.join('\n');
}

/**
 * Extract a UI navigation path from chunk content.
 *
 * Looks for patterns like:
 *   "Home > Stock > Material Request"
 *   "Go to: Setup > ..."
 *   "Navigate to: Stock > ..."
 *
 * This is intentionally heuristic. Documentation does not always use
 * exactly the same wording for navigation instructions.
 */
export function extractUiPath(content: string): string | null {
  const patterns = [
    /\b(Home\s*>\s*[A-Z][^\n]{5,60})/,
    /(?:Navigate|Go)\s+to[:\s]+([A-Z][^.\n]{5,60})/i,
    /\b(?:from|via)\s+the\s+([A-Z][^.\n]{5,50})\s+module/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match) {
      // Patterns with a capture group return the captured path.
      // The fallback handles patterns where the whole match is the path.
      return (match[1] ?? match[0]).trim();
    }
  }
  return null;
}

/**
 * Extract exact-match ERPNext terms from content.
 *
 * These terms are stored separately so the search layer can use them
 * for keyword matching in addition to the normal chunk content.
 *
 * We currently extract:
 * - Title-like multi-word terms
 * - Bold field names
 * - Backtick terms such as API names and field names
 */
export function extractTerms(content: string): string[] {
  const terms = new Set<string>();
  // Match title-like multi-word terms such as:
  // "Material Request"
  // "Purchase Receipt"
  // "Stock Entry"
  const docTypePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  for (const match of content.matchAll(docTypePattern)) {
    const term = match[1]?.trim() ?? '';
    if (term.length > 3 && term.length < 60) {
      terms.add(term);
    }
  }
  // Match explicitly emphasized field names:
  // **Reference Document**
  // **Target Warehouse**
  const boldTermPattern = /\*\*([^*]{2,50})\*\*/g;
  for (const match of content.matchAll(boldTermPattern)) {
    const term = match[1]?.trim() ?? '';
    if (term) {
      terms.add(term);
    }
  }
  // Match inline code:
  // `material_request`
  // `set_warehouse`
  // `docstatus`
  const codeTermPattern = /`([^`]{2,60})`/g;
  for (const match of content.matchAll(codeTermPattern)) {
    const term = match[1]?.trim() ?? '';
    // Ignore anything that somehow contains a newline.
    if (term && !term.includes('\n')) {
      terms.add(term);
    }
  }
  return [...terms];
}

/**
 * Add retrieval-oriented metadata to one child chunk.
 *
 * The original chunk content is preserved. The enrichedContent field is
 * a separate representation used later for search/embedding.
 */
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
