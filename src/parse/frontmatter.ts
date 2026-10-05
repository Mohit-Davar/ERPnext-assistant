import type { Frontmatter } from '@/parse/types';
import { Space } from '@/shared/types';

/**
 * Parse YAML-style frontmatter from Markdown content.
 *
 * Frappe docs use a simple frontmatter block:
 *   ---
 *   title: "..."
 *   space: "ERPNext"
 *   url: "https://..."
 *   updated: "2026-02-26"
 *   ---
 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseFrontmatter(raw: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(raw);
  const defaults: Frontmatter = {
    title: '',
    space: '',
    url: '',
    updated: '',
  };
  if (!match) {
    return { frontmatter: defaults, body: raw };
  }

  const block = match[1] ?? '';
  const body = raw.slice(match[0].length).trimStart();
  const frontmatter = { ...defaults };

  for (const line of block.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    // Strip surrounding quotes and trim whitespace/newlines
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']\s*$/g, '')
      .trim();
    if (key === 'title') {
      frontmatter.title = value;
    } else if (key === 'space') {
      frontmatter.space = value;
    } else if (key === 'url') {
      frontmatter.url = value;
    } else if (key === 'updated') {
      frontmatter.updated = value;
    }
  }

  return { frontmatter, body };
}
