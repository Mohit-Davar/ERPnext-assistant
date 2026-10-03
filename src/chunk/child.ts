import type { ChildChunk, ParentChunk } from './types.ts';

const TARGET_MIN_TOKENS = 200;
const TARGET_MAX_TOKENS = 500;

/** Rough token estimate: ~1 token per 4 characters */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Create a stable ID from a page id and a heading string.
 * e.g. "erpnext__material-request" + "Features" → "erpnext__material-request__features"
 */
export function createId(pageId: string, heading: string): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${pageId}__${slug}`;
}

/**
 * Create child chunks from a parent section.
 *
 * Strategy:
 * 1. Split on ### subheadings first.
 * 2. If a subsection is still > TARGET_MAX_TOKENS, split at paragraph boundaries.
 * 3. Never split mid-table or mid-list.
 * 4. If content is below TARGET_MIN_TOKENS, keep as a single child.
 */
export function createChildren(parent: ParentChunk): ChildChunk[] {
  const subsections = splitOnH3(parent.content, parent.heading);

  const children: ChildChunk[] = [];
  let childIndex = 0;

  for (const sub of subsections) {
    const subBreadcrumb =
      sub.heading !== parent.heading ? `${parent.breadcrumb} > ${sub.heading}` : parent.breadcrumb;
    const chunks = fitToTokenBudget(sub.content, TARGET_MAX_TOKENS);
    for (const chunkContent of chunks) {
      if (!chunkContent.trim()) continue;
      const id = `${createId(parent.pageId, parent.heading)}__c${childIndex}`;
      children.push({
        id,
        pageId: parent.pageId,
        parentId: parent.id,
        heading: sub.heading,
        breadcrumb: subBreadcrumb,
        content: chunkContent.trim(),
        space: parent.space,
        sourceUrl: parent.sourceUrl,
        updated: parent.updated,
        tokenCount: estimateTokens(chunkContent),
      });
      childIndex++;
    }
  }
  // If we produced no children (empty parent), return nothing
  return children;
}

interface Subsection {
  heading: string;
  content: string;
}

function splitOnH3(content: string, parentHeading: string): Subsection[] {
  const lines = content.split(/\r?\n/);
  const subsections: Subsection[] = [];
  let currentHeading = parentHeading;
  let currentLines: string[] = [];

  for (const line of lines) {
    const h3Match = /^### (.+)/.exec(line);
    if (h3Match) {
      if (currentLines.join('\n').trim()) {
        subsections.push({
          heading: currentHeading,
          content: currentLines.join('\n'),
        });
      }
      currentHeading = h3Match[1]?.trim() ?? line;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.join('\n').trim()) {
    subsections.push({ heading: currentHeading, content: currentLines.join('\n') });
  }

  if (subsections.length === 0) {
    subsections.push({ heading: parentHeading, content });
  }
  return subsections;
}

/**
 * If content exceeds maxTokens, split at paragraph boundaries.
 * Never breaks inside a list block or table block.
 */
function fitToTokenBudget(content: string, maxTokens: number): string[] {
  if (estimateTokens(content) <= maxTokens) {
    return [content];
  }

  const paragraphs = splitAtParagraphBoundaries(content);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    if (current.length === 0) {
      current = [para];
      currentTokens = paraTokens;
      continue;
    }
    const combinedTokens = currentTokens + paraTokens;
    // Keep adding content while we are below the preferred minimum.
    if (currentTokens < TARGET_MIN_TOKENS) {
      current.push(para);
      currentTokens = combinedTokens;
      continue;
    }
    // Once we have a reasonable-sized chunk, stop before exceeding max.
    if (combinedTokens > maxTokens) {
      chunks.push(current.join('\n\n'));
      current = [para];
      currentTokens = paraTokens;
      continue;
    }
    current.push(para);
    currentTokens = combinedTokens;
  }

  if (current.length > 0) {
    chunks.push(current.join('\n\n'));
  }

  return chunks;
}

/**
 * Split content at blank lines, but keep list blocks and table blocks together.
 */
function splitAtParagraphBoundaries(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const groups: string[] = [];
  let current: string[] = [];
  let inList = false;
  let inTable = false;

  for (const line of lines) {
    const isBlank = line.trim() === '';
    const isList = /^(\s*[-*+]|\s*\d+\.) /.test(line);
    const isTable = line.trim().startsWith('|');
    if (isBlank && !inList && !inTable) {
      if (current.length > 0) {
        groups.push(current.join('\n'));
        current = [];
      }
    } else {
      inList = isList;
      inTable = isTable;
      // If we just exited a list/table, force a boundary
      if (!isList && !isTable && (inList || inTable) && isBlank) {
        if (current.length > 0) {
          groups.push(current.join('\n'));
          current = [];
        }
        inList = false;
        inTable = false;
      }
      current.push(line);
    }
  }

  if (current.length > 0) {
    groups.push(current.join('\n'));
  }

  return groups.filter((g) => g.trim().length > 0);
}
