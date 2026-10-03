import { createId } from '@/chunk/child.ts';
import type { ParentChunk } from '@/chunk/types.ts';
import type { ParsedDocument } from '@/parse/types.ts';

/**
 * Split the document body into H2-level parent sections.
 *
 * Each parent is the full ## heading and all content until the next ##.
 * H1 content before the first H2 is treated as a preamble parent.
 */
export function splitParents(doc: ParsedDocument): ParentChunk[] {
  const lines = doc.body.split(/\r?\n/);
  const sections: { heading: string; lines: string[] }[] = [];
  let currentHeading = doc.title;
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = /^## (.+)/.exec(line);
    if (h2Match) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, lines: currentLines });
      }
      currentHeading = h2Match[1]?.trim() ?? line;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Push the final section
  if (currentLines.length > 0 || sections.length === 0) {
    sections.push({ heading: currentHeading, lines: currentLines });
  }

  return sections
    .map((section, i) => {
      const content = section.lines.join('\n').trim();
      if (!content) {
        return null;
      }
      const breadcrumb = i === 0 ? doc.title : `${doc.title} > ${section.heading}`;
      return {
        id: createId(doc.id, section.heading),
        pageId: doc.id,
        heading: section.heading,
        breadcrumb,
        content,
        space: doc.space,
        sourceUrl: doc.url,
        updated: doc.updated,
      } satisfies ParentChunk;
    })
    .filter((p): p is ParentChunk => p !== null);
}
