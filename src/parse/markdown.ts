function decodeEntities(text: string): string {
  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Transform raw Markdown body content into clean, searchable text.
 *
 * Rules:
 * - Decode common HTML entities
 * - Convert Frappe admonition blocks (:::note, :::warning, etc.) to plain text
 * - Replace image tags with their alt text (if useful)
 * - Preserve headings, lists, tables, bold, code blocks, links
 */
export function cleanMarkdown(body: string): string {
  let text = body;
  // 1. Decode HTML entities
  text = decodeEntities(text);

  // 2. Convert Frappe admonition blocks
  //    :::note\nContent\n:::  →  Note: Content
  text = text.replace(
    /^:::(note|warning|tip|danger|info|caution)\s*\r?\n([\s\S]*?)^:::\s*$/gim,
    (_match, type: string, content: string) => {
      const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      return `${label}: ${content.trim()}`;
    },
  );
  // Also handle unclosed admonitions (common in scraped docs)
  text = text.replace(
    /^:::(note|warning|tip|danger|info|caution)\s*\r?\n([\s\S]*?)(?=^##|\Z)/gim,
    (_match, type: string, content: string) => {
      const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      return `${label}: ${content.trim()}\n\n`;
    },
  );

  // 3. Replace image markdown with alt text (skip images with no useful alt)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) => {
    const trimmed = alt.trim();
    return trimmed.length > 3 ? `[Image: ${trimmed}]` : '';
  });

  // 4. Collapse 3+ consecutive blank lines to 2
  text = text.replace(/(\r?\n){3,}/g, '\n\n');
  return text.trim();
}
