import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { RawDocument } from '@/load/types.ts';
import type { Space } from '@/shared/types.ts';

const SPACE_MAP: Record<string, Space> = {
  erpnext: 'ERPNext',
  framework: 'Framework',
};

/**
 * Read all .md files from a docs/<space>/ directory and return RawDocuments.
 * Content hashes are computed so the load stage can detect changes.
 */
export async function loadDocuments(
  docsDir: string,
  spaces: string[] = ['erpnext', 'framework'],
): Promise<RawDocument[]> {
  const docs: RawDocument[] = [];

  for (const spaceName of spaces) {
    const spaceDir = path.join(docsDir, spaceName);

    let files: string[];
    try {
      files = await readdir(spaceDir);
    } catch {
      console.warn(`[load] Directory not found: ${spaceDir}`);
      continue;
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));
    for (const filename of mdFiles) {
      const filepath = path.join(spaceDir, filename);
      const rawContent = await readFile(filepath, 'utf8');
      const contentHash = createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
      const id = filename.replace(/\.md$/, '');
      docs.push({
        id,
        filename,
        filepath,
        space: SPACE_MAP[spaceName] ?? spaceName,
        contentHash,
        rawContent,
      });
    }
  }
  return docs;
}

/**
 * Return only documents that are new or changed compared to the manifest.
 */
export function filterChanged(
  docs: RawDocument[],
  manifestEntries: Record<string, { contentHash: string }>,
): { changed: RawDocument[]; unchanged: RawDocument[] } {
  const changed: RawDocument[] = [];
  const unchanged: RawDocument[] = [];
  for (const doc of docs) {
    const entry = manifestEntries[doc.id];
    if (!entry || entry.contentHash !== doc.contentHash) {
      changed.push(doc);
    } else {
      unchanged.push(doc);
    }
  }
  return { changed, unchanged };
}
