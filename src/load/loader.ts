import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { RawDocument } from '@/load/types.ts';
import type { Space } from '@/shared/types.ts';

const SPACE_LABEL_MAPPING: Record<string, Space> = {
  erpnext: 'ERPNext',
  framework: 'Framework',
};

/**
 * Read all .md files from a docs/<space>/ directory and return RawDocuments.
 * Content hashes are computed so the load stage can detect changes.
 */
export async function loadDocuments(
  rootDocsFolderPath: string,
  targetSpaceNames: string[],
): Promise<RawDocument[]> {
  const loadedDocuments: RawDocument[] = [];

  for (const spaceName of targetSpaceNames) {
    const spaceFolderPath = path.join(rootDocsFolderPath, spaceName);
    let directoryFileNames: string[];
    try {
      directoryFileNames = await readdir(spaceFolderPath);
    } catch {
      console.warn(`[load] Directory not found: ${spaceFolderPath}`);
      continue;
    }

    const markdownFileNames = directoryFileNames.filter((fileName) => fileName.endsWith('.md'));

    for (const fileName of markdownFileNames) {
      const fullFilePath = path.join(spaceFolderPath, fileName);
      const fileText = await readFile(fullFilePath, 'utf8');
      const sha256Hash = createHash('sha256').update(fileText).digest('hex').slice(0, 16);
      const documentId = fileName.replace(/\.md$/, '');

      loadedDocuments.push({
        id: documentId,
        filename: fileName,
        filepath: fullFilePath,
        space: SPACE_LABEL_MAPPING[spaceName] as Space,
        contentHash: sha256Hash,
        rawContent: fileText,
      });
    }
  }

  return loadedDocuments;
}

/**
 * Return only documents that are new or changed compared to the manifest.
 */
export function filterChanged(
  documentsList: RawDocument[],
  existingManifestHashes: Record<string, { contentHash: string }>,
): { modifiedDocs: RawDocument[]; unmodifiedDocs: RawDocument[] } {
  const modifiedDocs: RawDocument[] = [];
  const unmodifiedDocs: RawDocument[] = [];

  for (const document of documentsList) {
    const existingManifestRecord = existingManifestHashes[document.id];
    if (!existingManifestRecord || existingManifestRecord.contentHash !== document.contentHash) {
      modifiedDocs.push(document);
    } else {
      unmodifiedDocs.push(document);
    }
  }

  return { modifiedDocs, unmodifiedDocs };
}
