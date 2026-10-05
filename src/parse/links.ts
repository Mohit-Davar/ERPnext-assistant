import type { DocLink } from '@/parse/types.ts';

const FRAPPE_DOCS_BASE = 'https://docs.frappe.io';

/** Extract all Markdown links from body text */
export function extractLinks(body: string): DocLink[] {
  const links: DocLink[] = [];
  // Match [text](href) — skip image links ![...]
  const linkRe = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(body)) !== null) {
    const text = match[1] ?? '';
    const href = match[2] ?? '';
    const isInternal =
      href.startsWith('/') || href.startsWith(FRAPPE_DOCS_BASE) || href.startsWith('../');
    // Extract anchor
    const hashIdx = href.lastIndexOf('#');
    const anchor = hashIdx !== -1 ? href.slice(hashIdx) : null;
    links.push({ text, href, isInternal, anchor });
  }

  return links;
}
