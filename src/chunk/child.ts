import type { ChildChunk, ParentChunk } from '@/chunk/types.ts';

const OPTIMAL_CHUNK_MIN_TOKENS = 200;
const OPTIMAL_CHUNK_MAX_TOKENS = 500;

interface DocumentSection {
  headingText: string;
  sectionBody: string;
}

interface MarkdownContentBlock {
  rawLines: string[];
  blockCategory: 'paragraph' | 'list' | 'table' | 'code';
}

/**
 * Rough token estimate.
 * This is intentionally approximate and avoids requiring a heavy tokenizer.
 *
 * We use characters instead of a real tokenizer because exact token counts
 * are not required for chunking. We only need a consistent size estimate.
 */
function calculateEstimatedTokens(textSnippet: string): number {
  return Math.ceil(textSnippet.length / 4);
}

/**
 * Check whether a line starts a Markdown unordered or ordered list item.
 *
 * Examples:
 *   - First item
 *   * First item
 *   1. First item
 *   2) First item
 */
function checkIsListItem(lineText: string): boolean {
  return /^(?:[-*+]|\d+[.)])\s+/.test(lineText);
}
/**
 * Check whether a line is an indented continuation of a list item.
 *
 * Example:
 *   - First item
 *     Additional explanation for the first item
 *
 * The indentation tells us that the second line belongs to the list
 * instead of being treated as a separate paragraph.
 */
function checkIsIndentedListContinuation(lineText: string): boolean {
  return /^\s{2,}\S/.test(lineText);
}
/**
 * Check whether a line looks like a Markdown table row.
 *
 * We intentionally keep this simple for V1. Frappe documentation tables
 * normally use the pipe-based Markdown table format.
 */
function checkIsTableRow(lineText: string): boolean {
  return lineText.startsWith('|');
}
/**
 * Determine the type of Markdown block started by a line.
 *
 * Code blocks are handled separately in extractMarkdownBlocks() because
 * their contents should not be interpreted as normal Markdown.
 */
function determineLineCategory(lineText: string): MarkdownContentBlock['blockCategory'] {
  const cleanLine = lineText.trim();
  if (checkIsTableRow(cleanLine)) {
    return 'table';
  }
  if (checkIsListItem(cleanLine)) {
    return 'list';
  }
  return 'paragraph';
}
/**
 * Add the currently collected lines as one completed Markdown block.
 *
 * Keeping this in one helper avoids repeating the same "if there are lines,
 * create a block" logic in multiple places.
 */
function appendCompletedBlock(
  collectedBlocksList: MarkdownContentBlock[],
  accumulatedLines: string[],
  blockCategory: MarkdownContentBlock['blockCategory'],
): void {
  if (accumulatedLines.length === 0) {
    return;
  }
  collectedBlocksList.push({
    rawLines: accumulatedLines,
    blockCategory,
  });
}
/**
 * Split Markdown into logical blocks.
 *
 * Blocks are separated by blank lines, except:
 * - list items stay together
 * - tables stay together
 * - fenced code blocks stay together
 *
 * The purpose of this step is to give the chunker safe places where it can
 * split content without breaking common Markdown structures.
 */
function extractMarkdownBlocks(rawMarkdownContent: string): string[] {
  const contentLines = rawMarkdownContent.split(/\r?\n/);
  const parsedBlocks: MarkdownContentBlock[] = [];
  // These hold the Markdown block currently being built.
  let currentBlockLines: string[] = [];
  let currentCategory: MarkdownContentBlock['blockCategory'] = 'paragraph';

  // Once we enter ``` or ~~~, every following line belongs to the code block
  // until the matching fence is found.
  let insideCodeFence = false;
  for (const lineText of contentLines) {
    const trimmedLine = lineText.trim();
    // Detect the beginning or end of a fenced code block.
    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      if (!insideCodeFence) {
        // Finish anything that appeared before the code block.
        appendCompletedBlock(parsedBlocks, currentBlockLines, currentCategory);
        // Start collecting the complete code block as one unit.
        currentBlockLines = [lineText];
        currentCategory = 'code';
        insideCodeFence = true;
        continue;
      }
      // Include the closing fence before storing the code block.
      currentBlockLines.push(lineText);
      appendCompletedBlock(parsedBlocks, currentBlockLines, currentCategory);
      currentBlockLines = [];
      currentCategory = 'paragraph';
      insideCodeFence = false;
      continue;
    }
    // Everything inside a fenced code block belongs to that code block.
    // We must not interpret lines inside it as lists, tables, etc.
    if (insideCodeFence) {
      currentBlockLines.push(lineText);
      continue;
    }
    const detectedCategory = determineLineCategory(lineText);
    // A blank line normally marks the end of a Markdown block.
    if (trimmedLine === '') {
      appendCompletedBlock(parsedBlocks, currentBlockLines, currentCategory);
      currentBlockLines = [];
      currentCategory = 'paragraph';
      continue;
    }
    // If there is no active block, this line starts a new one.
    if (currentBlockLines.length === 0) {
      currentBlockLines = [lineText];
      currentCategory = detectedCategory;
      continue;
    }
    // Keep consecutive list items in the same block.
    //
    // This prevents the chunker from splitting a list into separate pieces
    // when it later combines Markdown blocks into chunks.
    if (currentCategory === 'list' && detectedCategory === 'list') {
      currentBlockLines.push(lineText);
      continue;
    }
    // Keep consecutive table rows together.
    //
    // Splitting a table between chunks can remove the relationship between
    // its header row and the data rows.
    if (currentCategory === 'table' && detectedCategory === 'table') {
      currentBlockLines.push(lineText);
      continue;
    }
    // Keep indented continuation lines with the parent list.
    if (currentCategory === 'list' && checkIsIndentedListContinuation(lineText)) {
      currentBlockLines.push(lineText);
      continue;
    }
    // For normal paragraph content, continue collecting lines into the
    // current block until a blank line is encountered.
    currentBlockLines.push(lineText);
  }
  // The final block will not be followed by a blank line, so make sure
  // it is added after the loop finishes.
  appendCompletedBlock(parsedBlocks, currentBlockLines, currentCategory);
  // Convert each block back into Markdown text.
  //
  // Empty blocks are removed because they do not contain useful content
  // and would otherwise affect chunk-size calculations.
  return parsedBlocks.map((block) => block.rawLines.join('\n').trim()).filter(Boolean);
}
/**
 * Split content into chunks while respecting Markdown block boundaries.
 *
 * The function first checks whether the entire section already fits within
 * the target size. If it does, there is no reason to split it further.
 */
function partitionTextIntoChunks(rawTextContent: string): string[] {
  if (calculateEstimatedTokens(rawTextContent) <= OPTIMAL_CHUNK_MAX_TOKENS) {
    return [rawTextContent];
  }
  // Large sections are first converted into logical Markdown blocks.
  // We then combine those blocks until adding another block would exceed
  // the preferred maximum size.
  const individualBlocks = extractMarkdownBlocks(rawTextContent);
  const generatedChunks: string[] = [];

  let activeChunkBlocks: string[] = [];
  let activeTokenCount = 0;
  for (const blockText of individualBlocks) {
    const blockTokenCount = calculateEstimatedTokens(blockText);
    // Always put the first block into an empty chunk.
    //
    // A single block can be larger than the maximum target. We still keep
    // it intact because splitting inside a table, list, or code block can
    // damage the meaning of the content.
    if (activeChunkBlocks.length === 0) {
      activeChunkBlocks.push(blockText);
      activeTokenCount = blockTokenCount;
      continue;
    }
    const combinedTokenCount = activeTokenCount + blockTokenCount;
    // Build up to the preferred minimum size before splitting.
    //
    // The minimum is a soft target. We prefer useful context over creating
    // many very small chunks.
    if (activeTokenCount < OPTIMAL_CHUNK_MIN_TOKENS) {
      activeChunkBlocks.push(blockText);
      activeTokenCount = combinedTokenCount;
      continue;
    }
    // Push current chunk if adding the new block exceeds max target.
    //
    // We only split between complete Markdown blocks, never in the middle
    // of a block.
    if (combinedTokenCount > OPTIMAL_CHUNK_MAX_TOKENS) {
      generatedChunks.push(activeChunkBlocks.join('\n\n'));
      activeChunkBlocks = [blockText];
      activeTokenCount = blockTokenCount;
      continue;
    }
    // The block still fits, so keep it in the current chunk.
    activeChunkBlocks.push(blockText);
    activeTokenCount = combinedTokenCount;
  }
  // Add the final chunk after all blocks have been processed.
  if (activeChunkBlocks.length > 0) {
    generatedChunks.push(activeChunkBlocks.join('\n\n'));
  }
  return generatedChunks;
}
/**
 * Register a parsed H3 subsection.
 *
 * Empty sections are ignored because a heading without content does not
 * produce a useful retrieval chunk.
 */
function registerSection(
  sectionsList: DocumentSection[],
  sectionHeading: string,
  sectionLines: string[],
): void {
  const combinedBodyText = sectionLines.join('\n').trim();
  if (!combinedBodyText) {
    return;
  }
  sectionsList.push({
    headingText: sectionHeading,
    sectionBody: combinedBodyText,
  });
}
/**
 * Split a parent section at H3 headings.
 *
 * Content before the first H3 keeps the parent heading.
 *
 * Example:
 *
 *   ## Material Request
 *
 *   Introductory content
 *
 *   ### Features
 *
 *   Feature content
 *
 * becomes:
 *
 *   Material Request → Introductory content
 *   Features         → Feature content
 */
function parseSubsectionsByH3(sectionContent: string, defaultHeading: string): DocumentSection[] {
  const documentLines = sectionContent.split(/\r?\n/);
  const parsedSectionsList: DocumentSection[] = [];
  // Before the first H3, content belongs to the parent section itself.
  let activeHeading = defaultHeading;
  let activeSectionLines: string[] = [];
  for (const lineText of documentLines) {
    const h3HeadingMatch = /^###\s+(.+)$/.exec(lineText);
    if (h3HeadingMatch) {
      // Store the content collected under the previous heading before
      // starting the new H3 subsection.
      registerSection(parsedSectionsList, activeHeading, activeSectionLines);
      // The matched H3 becomes the heading for the next subsection.
      activeHeading = h3HeadingMatch[1]?.trim() ?? defaultHeading;
      activeSectionLines = [];
      continue;
    }
    activeSectionLines.push(lineText);
  }
  // Store the final subsection after the loop ends.
  registerSection(parsedSectionsList, activeHeading, activeSectionLines);
  return parsedSectionsList;
}
/**
 * Create a stable ID from a page ID and heading.
 *
 * Example:
 *   pageId: "erpnext__material-request"
 *   heading: "Material Transfer"
 *
 *   → "erpnext__material-request__material-transfer"
 *
 * The heading is converted into a URL-like slug so the generated ID
 * remains readable and deterministic.
 */
export function createId(pageIdentifier: string, sectionHeading: string): string {
  const normalizedSlug = sectionHeading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${pageIdentifier}__${normalizedSlug}`;
}
/**
 * Create child chunks from a parent section.
 *
 * Strategy:
 * 1. Split the parent at H3 headings.
 * 2. Keep small subsections as one child.
 * 3. Split large subsections at Markdown block boundaries.
 * 4. Keep lists, tables, and code blocks together.
 * 5. Prefer chunks between 200 and 500 estimated tokens.
 *
 * The 500-token limit is a target, not an absolute rule.
 * An indivisible Markdown block may be larger than 500 tokens.
 */
export function createChildren(parentChunkData: ParentChunk): ChildChunk[] {
  // First divide the H2 parent section into smaller H3-level sections.
  // This gives each child chunk a more specific heading and breadcrumb.
  const documentSubsections = parseSubsectionsByH3(
    parentChunkData.content,
    parentChunkData.heading,
  );
  const createdChildChunks: ChildChunk[] = [];
  // This index is local to the parent document and gives each generated
  // child chunk a deterministic suffix such as __c0, __c1, __c2.
  let chunkSequenceIndex = 0;
  for (const section of documentSubsections) {
    // H3 sections get a more specific breadcrumb.
    //
    // Content that appeared before the first H3 keeps the parent's
    // existing breadcrumb because it does not have a separate subsection.
    const breadcrumbTrail =
      section.headingText === parentChunkData.heading
        ? parentChunkData.breadcrumb
        : `${parentChunkData.breadcrumb} > ${section.headingText}`;
    // A small subsection becomes one chunk.
    // A large subsection is divided into Markdown-safe chunks.
    const textChunkSegments = partitionTextIntoChunks(section.sectionBody);
    for (const chunkTextSegment of textChunkSegments) {
      const sanitizedChunkContent = chunkTextSegment.trim();
      // This should normally not happen because empty blocks are already
      // filtered earlier, but keeping this guard makes chunk creation safe.
      if (!sanitizedChunkContent) {
        continue;
      }
      // All children created from this parent share the same parent-section
      // ID. The __cN suffix then identifies the individual child.
      const parentSectionId = createId(parentChunkData.pageId, parentChunkData.heading);
      createdChildChunks.push({
        id: `${parentSectionId}__c${chunkSequenceIndex}`,
        pageId: parentChunkData.pageId,
        parentId: parentChunkData.id,
        heading: section.headingText,
        breadcrumb: breadcrumbTrail,
        content: sanitizedChunkContent,
        space: parentChunkData.space,
        sourceUrl: parentChunkData.sourceUrl,
        updated: parentChunkData.updated,
        tokenCount: calculateEstimatedTokens(sanitizedChunkContent),
      });
      chunkSequenceIndex++;
    }
  }
  return createdChildChunks;
}
