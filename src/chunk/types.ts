import type { Space } from '@/shared/types.ts';

/** The full ## section — used as context for the LLM */
export interface ParentChunk {
  id: string;
  pageId: string;
  heading: string;
  breadcrumb: string;
  content: string;
  space: Space;
  sourceUrl: string;
  updated: string;
}

/** Smaller searchable unit inside a parent section */
export interface ChildChunk {
  id: string;
  pageId: string;
  parentId: string;
  heading: string;
  breadcrumb: string;
  content: string;
  space: Space;
  sourceUrl: string;
  updated: string;
  /** Approximate token count (word-based estimate) */
  tokenCount: number;
}
