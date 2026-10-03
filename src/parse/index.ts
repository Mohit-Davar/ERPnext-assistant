import type { RawDocument } from '@/load/types.ts';
import { parseFrontmatter } from '@/parse/frontmatter.ts';
import { extractLinks } from '@/parse/links.ts';
import { cleanMarkdown } from '@/parse/markdown.ts';
import type { ParsedDocument } from '@/parse/types.ts';

export function parseDocument(raw: RawDocument): ParsedDocument {
  const { frontmatter, body } = parseFrontmatter(raw.rawContent);
  const cleanBody = cleanMarkdown(body);
  const links = extractLinks(cleanBody);
  return {
    id: raw.id,
    filename: raw.filename,
    space: frontmatter.space || raw.space,
    title: frontmatter.title || raw.id,
    url: frontmatter.url,
    updated: frontmatter.updated,
    body: cleanBody,
    links,
  };
}

export function parseDocuments(raws: RawDocument[]): ParsedDocument[] {
  return raws.map(parseDocument);
}
