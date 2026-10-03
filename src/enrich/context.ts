import type { ChildChunk } from '@/chunk/types.ts';
import type { ChunkLink, EnrichedChunk } from '@/enrich/types.ts';
import type { ParsedDocument } from '@/parse/types.ts';

const FRAPPE_DOCS_BASE = 'https://docs.frappe.io';

/**
 * Resolve documentation links to chunk IDs.
 *
 * Links like /erpnext/stock-settings#9-automatic-material-request
 * are resolved to a page ID (and chunk ID if the anchor maps to a known heading).
 */
export function resolveLinks(
  docs: ParsedDocument[],
  chunks: ChildChunk[],
): (
  fromChunkId: string,
  links: { href: string; isInternal: boolean; anchor: string | null }[],
) => ChunkLink[] {
  // Build lookup maps
  const pagesByPath = new Map<string, string>(); // path → pageId
  for (const doc of docs) {
    if (doc.url) {
      try {
        const u = new URL(doc.url);
        pagesByPath.set(u.pathname, doc.id);
      } catch {
        // skip invalid URLs
      }
    }
  }

  const chunksByBreadcrumbSlug = new Map<string, string>(); // slug → chunkId
  for (const chunk of chunks) {
    const slug = slugify(chunk.heading);
    chunksByBreadcrumbSlug.set(`${chunk.pageId}::${slug}`, chunk.id);
  }

  return (fromChunkId, links) => {
    return links
      .filter((l) => l.isInternal)
      .map((link) => {
        const href = link.href.startsWith('http')
          ? link.href.replace(FRAPPE_DOCS_BASE, '')
          : link.href;
        const hashIdx = href.indexOf('#');
        const pathPart = hashIdx !== -1 ? href.slice(0, hashIdx) : href;
        const anchorPart = hashIdx !== -1 ? href.slice(hashIdx + 1) : null;
        const toPageId = pagesByPath.get(pathPart) ?? null;
        let toChunkId: string | null = null;
        if (toPageId && anchorPart) {
          toChunkId = chunksByBreadcrumbSlug.get(`${toPageId}::${anchorPart}`) ?? null;
        }
        return {
          fromChunkId,
          toPageId,
          toAnchor: anchorPart,
          toChunkId,
          href: link.href,
        } satisfies ChunkLink;
      });
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function enrichChunksWithLinks(
  enrichedChunks: EnrichedChunk[],
  docs: ParsedDocument[],
): ChunkLink[] {
  const baseChunks = enrichedChunks.map((c) => ({
    id: c.id,
    pageId: c.pageId,
    heading: c.heading,
  }));

  const resolver = resolveLinks(
    docs,
    baseChunks.map((c) => ({
      ...c,
      parentId: '',
      breadcrumb: '',
      content: '',
      space: '',
      sourceUrl: '',
      updated: '',
      tokenCount: 0,
    })),
  );

  const allLinks: ChunkLink[] = [];
  for (const chunk of enrichedChunks) {
    const doc = docs.find((d) => d.id === chunk.pageId);
    if (!doc) continue;
    const links = resolver(chunk.id, doc.links);
    allLinks.push(...links);
  }

  return allLinks;
}
