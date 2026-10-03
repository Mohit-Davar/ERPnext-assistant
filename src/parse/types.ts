import type { Space } from '@/shared/types.ts';

/** A link extracted from a documentation page */
export interface DocLink {
  text: string;
  href: string;
  /** True if the href points to another Frappe/ERPNext doc page */
  isInternal: boolean;
  /** Anchor fragment if present, e.g. "#section-name" */
  anchor: string | null;
}

/** Structured document after parsing frontmatter and markdown */
export interface ParsedDocument {
  /** Filename without extension, e.g. "erpnext__material-request" */
  id: string;
  filename: string;
  space: Space;
  title: string;
  url: string;
  updated: string;
  /** Cleaned body text (no frontmatter, transformed admonitions, etc.) */
  body: string;
  links: DocLink[];
}

export interface Frontmatter {
  title: string;
  space: string;
  url: string;
  updated: string;
}
