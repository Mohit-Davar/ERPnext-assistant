import type { Space } from '@/shared/types.ts';

/** A raw document read from disk before any processing */
export interface RawDocument {
  /** Filename without extension, e.g. "erpnext__material-request" */
  id: string;
  filename: string;
  filepath: string;
  space: Space;
  contentHash: string;
  rawContent: string;
}

/** Manifest entry for a single documentation page */
export interface ManifestEntry {
  url: string;
  filename: string;
  space: Space;
  status: 'ok' | 'failed' | 'skipped';
  contentHash: string;
  updated: string;
  lastFetched: string;
}

/** The full manifest file structure */
export interface Manifest {
  version: 1;
  entries: Record<string, ManifestEntry>; // keyed by filename only
}
