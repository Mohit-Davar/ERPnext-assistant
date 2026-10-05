/** Documentation space identifier */
export type Space = 'ERPNext' | 'Framework';

/** Configuration loaded from environment variables */
export interface Config {
  openaiApiKey: string;
  embeddingModel: string;
  llmModel: string;

  cohereApiKey: string;
  rerankModel: string;

  dbPath: string;
  docsDir: string;
}

export interface ChunkRow {
  breadcrumb: string;
  source_url: string;
  space: string;
}
