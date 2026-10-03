import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Manifest } from '@/load/types.ts';

const MANIFEST_FILENAME = 'manifest.json';

export async function loadManifest(docsDir: string): Promise<Manifest> {
  const manifestPath = path.join(docsDir, MANIFEST_FILENAME);
  try {
    const raw = await readFile(manifestPath, 'utf8');
    return JSON.parse(raw) as Manifest;
  } catch {
    // No manifest yet then return an empty one
    return { version: 1, entries: {} };
  }
}

export async function saveManifest(docsDir: string, manifest: Manifest): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const manifestPath = path.join(docsDir, MANIFEST_FILENAME);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}
