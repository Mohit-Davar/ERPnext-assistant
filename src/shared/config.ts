import type { Config } from '@/shared/types.ts';

function getEnv(name: string, fallback: string = ''): string {
  return process.env[name]?.trim() || fallback;
}

/**
 * Load configuration from environment variables with safe defaults.
 */
export function loadConfig(): Config {
  return {
    openaiApiKey: getEnv('OPENAI_API_KEY', ''),
    embeddingModel: getEnv('EMBEDDING_MODEL', 'text-embedding-3-small'),
    llmModel: getEnv('LLM_MODEL', 'gpt-4o-mini'),

    cohereApiKey: getEnv('COHERE_API_KEY', ''),
    rerankModel: getEnv('RERANK_MODEL', 'rerank-v3.5'),

    dbPath: getEnv('DB_PATH', './data/erpnext.db'),
    docsDir: getEnv('DOCS_DIR', './docs'),
  };
}
