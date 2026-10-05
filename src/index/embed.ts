import type { Config } from '@/shared/types.ts';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAI(config: Config): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }
  return openaiClient;
}

/**
 * Generate an embedding vector for a single text.
 */
export async function getEmbedding(text: string, config: Config): Promise<number[]> {
  const client = getOpenAI(config);
  const response = await client.embeddings.create({
    model: config.embeddingModel,
    input: text,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('OpenAI returned no embedding');
  }

  return embedding;
}

/**
 * Generate embeddings for multiple texts.
 *
 * OpenAI accepts multiple inputs in one embeddings request.
 */
export async function batchEmbed(
  texts: string[],
  config: Config,
  batchSize = 100,
  onProgress?: (completed: number, total: number) => void,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const client = getOpenAI(config);
  const results: number[][] = new Array(texts.length);

  const batches: { start: number; batch: string[] }[] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push({ start: i, batch: texts.slice(i, i + batchSize) });
  }

  let completed = 0;
  const concurrency = 5;
  for (let i = 0; i < batches.length; i += concurrency) {
    const currentBatches = batches.slice(i, i + concurrency);
    await Promise.all(
      currentBatches.map(async ({ start, batch }) => {
        const response = await client.embeddings.create({
          model: config.embeddingModel,
          input: batch,
        });
        const embeddings = response.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding as number[]);
        if (embeddings.length !== batch.length) {
          throw new Error(
            `OpenAI returned ${embeddings.length} embeddings for ${batch.length} inputs`,
          );
        }
        for (let j = 0; j < embeddings.length; j++) {
          results[start + j] = embeddings[j]!;
        }
        completed += batch.length;
        if (onProgress) onProgress(completed, texts.length);
      }),
    );
  }

  return results;
}
