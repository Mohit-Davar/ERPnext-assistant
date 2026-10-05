import { chunkDocuments } from '@/chunk/index.ts';
import { enrichChunks } from '@/enrich/index.ts';
import { indexAll, openDatabase } from '@/index/index.ts';
import { filterChanged, loadDocuments, loadManifest, saveManifest } from '@/load/index.ts';
import { parseDocuments } from '@/parse/index.ts';
import { loadConfig } from '@/shared/config.ts';

const appConfig = loadConfig();

const colorText = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
};

const createConsoleSpinner = (taskMessage: string) => ({
  start: () => {
    console.log(`[i] ${taskMessage}`);
    return {
      succeed: (successMessage: string) => console.log(colorText.green(`✓ ${successMessage}`)),
      fail: (errorMessage: string) => console.log(colorText.red(`✗ ${errorMessage}`)),
    };
  },
});

export interface IngestResult {
  unchanged: number;
  changed: number;
  parsed: number;
  parents: number;
  children: number;
  enriched: number;
  links: number;
}

export async function ingest(
  onProgressUpdate?: (statusMessage: string) => void,
): Promise<IngestResult> {
  const logProgress = onProgressUpdate ?? (() => {});

  // 1. Load //
  logProgress('Loading manifest and documents...');
  const manifestData = await loadManifest(appConfig.docsDir);
  const allDocuments = await loadDocuments(appConfig.docsDir, ['erpnext', 'framework']);
  if (allDocuments.length === 0) {
    throw new Error(`No Markdown documentation found in "${appConfig.docsDir}".`);
  }
  // filter out unchanged documents
  const { modifiedDocs, unmodifiedDocs } = filterChanged(allDocuments, manifestData.entries);
  // get database connection
  const database = openDatabase(appConfig.dbPath);
  // how many documents to process
  const indexedPageCount =
    database.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM pages').get()?.count ?? 0;
  const isDatabaseEmpty = indexedPageCount === 0;
  const documentsToIndex = isDatabaseEmpty ? allDocuments : modifiedDocs;
  // if no documents to index, return
  if (documentsToIndex.length === 0) {
    return {
      unchanged: unmodifiedDocs.length,
      changed: 0,
      parsed: 0,
      parents: 0,
      children: 0,
      enriched: 0,
      links: 0,
    };
  }

  // 2. Parse //
  logProgress(`Parsing ${documentsToIndex.length} documents...`);
  const parsedDocuments = parseDocuments(documentsToIndex);

  // 3. Chunk //
  logProgress(`Chunking documents...`);
  const { parents: parentChunks, children: childChunks } = chunkDocuments(parsedDocuments);

  // 4. Enrich //
  logProgress(`Enriching ${childChunks.length} chunks...`);
  const { enrichedChunks, links: extractedLinks } = enrichChunks(childChunks, parsedDocuments);

  // 5. Index //
  logProgress('Indexing documents, chunks, and links...');
  await indexAll(
    database,
    parsedDocuments,
    parentChunks,
    enrichedChunks,
    extractedLinks,
    appConfig,
    onProgressUpdate,
  );

  logProgress('Updating manifest...');
  // Update manifest
  const currentTimestamp = new Date().toISOString();

  for (const document of documentsToIndex) {
    const matchingParsedDoc = parsedDocuments.find((parsedDoc) => parsedDoc.id === document.id);

    manifestData.entries[document.id] = {
      url: matchingParsedDoc?.url ?? '',
      filename: document.filename,
      space: document.space,
      status: 'ok',
      contentHash: document.contentHash,
      updated: matchingParsedDoc?.updated ?? '',
      lastFetched: currentTimestamp,
    };
  }

  await saveManifest(appConfig.docsDir, manifestData);

  return {
    unchanged: unmodifiedDocs.length,
    changed: modifiedDocs.length,
    parsed: parsedDocuments.length,
    parents: parentChunks.length,
    children: childChunks.length,
    enriched: enrichedChunks.length,
    links: extractedLinks.length,
  };
}

async function main() {
  const loadingIndicator = createConsoleSpinner('Starting ingest pipeline...').start();

  try {
    const pipelineSummary = await ingest((statusText) =>
      console.log(colorText.gray(`  ${statusText}`)),
    );

    loadingIndicator.succeed(`Ingest completed:
  - Unchanged: ${pipelineSummary.unchanged}
  - Changed:   ${pipelineSummary.changed}
  - Parsed:    ${pipelineSummary.parsed}
  - Parents:   ${pipelineSummary.parents}
  - Children:  ${pipelineSummary.children}
  - Enriched:  ${pipelineSummary.enriched}
  - Links:     ${pipelineSummary.links}`);
  } catch (executionError) {
    loadingIndicator.fail('Ingest failed');
    console.error(executionError);
    process.exit(1);
  }
}

main();
