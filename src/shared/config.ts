import type { Config } from '@/shared/types.ts';

/**
 * Load configuration from environment variables.
 * All values can be overridden via a .env file (Bun loads .env automatically).
 */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig(): Config {
  return {
    openaiApiKey: requiredEnv('OPENAI_API_KEY'),
    embeddingModel: requiredEnv('EMBEDDING_MODEL'),
    llmModel: requiredEnv('LLM_MODEL'),

    cohereApiKey: requiredEnv('COHERE_API_KEY'),
    rerankModel: requiredEnv('RERANK_MODEL'),

    dbPath: requiredEnv('DB_PATH'),
    docsDir: requiredEnv('DOCS_DIR'),
  };
}
