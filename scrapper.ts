import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import ora from 'ora';

const DOCS = [
  {
    name: 'framework',
    llmsUrl: 'https://docs.frappe.io/framework/llms.txt',
  },
  {
    name: 'erpnext',
    llmsUrl: 'https://docs.frappe.io/erpnext/llms.txt',
  },
];

const OUTPUT_DIR = 'docs';

async function fetchWithRetry(url: string, retries = 3, delayMs = 1000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

function getFilename(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.replace(/^\/+|\/+$/g, '').replaceAll('/', '__');
}

async function downloadDocs(name: string, llmsUrl: string) {
  const outputDir = path.join(OUTPUT_DIR, name);
  await mkdir(outputDir, { recursive: true });
  const spinner = ora(`Fetching ${name} documentation index...`).start();
  try {
    const response = await fetchWithRetry(llmsUrl);
    const markdownLinks = await response.text();
    spinner.succeed(`Fetched ${name} documentation index`);
    // Extract all Markdown links from llms.txt.
    const matches = markdownLinks.matchAll(/\]\((https?:\/\/[^)]+\.md)\)/g);
    // Remove duplicate URLs.
    const urls = [
      ...new Set(
        [...matches].map((match) => match[1]).filter((url): url is string => url !== undefined),
      ),
    ];
    console.log(chalk.blue(`${name}: Found ${urls.length} documentation pages.\n`));

    let downloaded = 0;
    let failed = 0;
    for (const url of urls) {
      const filename = getFilename(url);
      const filePath = path.join(outputDir, filename);
      try {
        const response = await fetchWithRetry(url);
        const markdown = await response.text();
        await writeFile(filePath, markdown, 'utf8');
        downloaded++;
        console.log(chalk.green(`✓ ${filename}`));
      } catch (error) {
        failed++;
        console.log(
          chalk.red(`✗ ${filename}`),
          chalk.gray(error instanceof Error ? error.message : 'Unknown error'),
        );
      }
    }
    console.log();
    console.log(chalk.green(`${name}: Downloaded ${downloaded}`));
    if (failed > 0) {
      console.log(chalk.red(`${name}: Failed ${failed}`));
    }
  } catch (error) {
    spinner.fail(`Failed to fetch ${name} documentation index`);
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const docs of DOCS) {
    await downloadDocs(docs.name, docs.llmsUrl);
  }
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  process.exit(1);
});
