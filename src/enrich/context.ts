import type { ChunkLink, ChunkReference, EnrichedChunk, LinkResolver } from '@/enrich/types.ts';
import type { ParsedDocument } from '@/parse/types.ts';

const FRAPPE_DOCS_BASE = 'https://docs.frappe.io';

/**
 * Resolve documentation links to page and chunk IDs.
 *
 * A link can resolve to:
 * - a page only
 * - a page and a specific chunk
 * - neither, if the target is not present in the indexed documentation
 *
 * Example:
 *
 * /erpnext/stock-settings#automatic-material-request
 *
 * becomes:
 *
 * {
 *   toPageId: "...",
 *   toAnchor: "automatic-material-request",
 *   toChunkId: "..."
 * }
 */
export function resolveLinks(docs: ParsedDocument[], chunks: ChunkReference[]): LinkResolver {
  // Map documentation URL paths to their internal page IDs.
  //
  // This lets us resolve:
  // /erpnext/stock-settings
  //        ↓
  // erpnext__stock-settings
  const pagesByPath = new Map<string, string>();
  for (const doc of docs) {
    if (!doc.url) {
      continue;
    }
    try {
      const url = new URL(doc.url);
      pagesByPath.set(url.pathname, doc.id);
    } catch {
      // Ignore malformed document URLs.
      // A bad URL should not prevent the rest of the documentation
      // from being enriched.
    }
  }
  // Map a page + heading to the child chunk representing that heading.
  //
  // Example:
  // pageId::automatic-material-request
  //        ↓
  // page__features__c2
  //
  // This is best-effort because URL anchors are not guaranteed to match
  // Markdown headings exactly.
  const chunksByHeading = new Map<string, string>();
  for (const chunk of chunks) {
    const headingSlug = slugify(chunk.heading);
    chunksByHeading.set(`${chunk.pageId}::${headingSlug}`, chunk.id);
  }
  return (fromChunkId, links) => {
    return (
      links
        // Only documentation-internal links can be resolved against our
        // indexed pages and chunks.
        .filter((link) => link.isInternal)
        .map((link) => {
          const href = normalizeHref(link.href);
          // Separate the page path from the optional #anchor.
          const hashIndex = href.indexOf('#');
          const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
          const anchorPart = hashIndex === -1 ? null : href.slice(hashIndex + 1);
          // Resolve the URL path to one of our indexed pages.
          const toPageId = pagesByPath.get(pathPart) ?? null;
          let toChunkId: string | null = null;
          // If the link contains an anchor and the target page exists,
          // try to resolve the anchor to a specific child chunk.
          if (toPageId && anchorPart) {
            toChunkId = chunksByHeading.get(`${toPageId}::${anchorPart}`) ?? null;
          }
          return {
            fromChunkId,
            toPageId,
            toAnchor: anchorPart,
            toChunkId,
            href: link.href,
          } satisfies ChunkLink;
        })
    );
  };
}

/**
 * Convert an internal documentation URL into a path that can be
 * compared against ParsedDocument.url.
 *
 * External URLs are left unchanged because only internal links are
 * resolved by the resolver.
 */
function normalizeHref(href: string): string {
  if (href.startsWith(FRAPPE_DOCS_BASE)) {
    return href.slice(FRAPPE_DOCS_BASE.length);
  }
  return href;
}

/**
 * Convert a heading into the same simple slug format used by chunk IDs.
 *
 * Example:
 * "Automatically Generate Material Requests"
 *      ↓
 * "automatically-generate-material-requests"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolve all internal links contained in the enriched chunks.
 *
 * The document lookup uses a Map so each chunk can find its source
 * document without repeatedly scanning the entire docs array.
 */
export function enrichChunksWithLinks(
  enrichedChunks: EnrichedChunk[],
  docs: ParsedDocument[],
): ChunkLink[] {
  // The link resolver only needs these three properties from a chunk.
  // Keeping this as a small reference type avoids creating fake ChildChunk
  // objects with empty values just to satisfy a function signature.
  const chunkReferences: ChunkReference[] = enrichedChunks.map((chunk) => ({
    id: chunk.id,
    pageId: chunk.pageId,
    heading: chunk.heading,
  }));
  const resolver = resolveLinks(docs, chunkReferences);
  // Create a direct page ID → document lookup.
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const allLinks: ChunkLink[] = [];
  for (const chunk of enrichedChunks) {
    // Find the document that originally contained this chunk.
    const doc = docsById.get(chunk.pageId);
    if (!doc) {
      continue;
    }
    // Resolve links found in this document as links originating from
    // the current chunk.
    const links = resolver(chunk.id, doc.links);
    allLinks.push(...links);
  }
  return allLinks;
}
