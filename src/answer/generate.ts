import { appendFileSync } from 'node:fs';

import type { Config } from '@/shared/types.ts';
import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(config: Config): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  return client;
}

/**
 * Stream a grounded answer from OpenAI.
 */
export async function* streamLLM(
  system: string,
  user: string,
  config: Config,
): AsyncIterable<string> {
  if (!config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to your environment before asking a question.',
    );
  }

  try {
    const openai = getClient(config);
    const stream = await openai.responses.stream({
      model: config.llmModel,
      instructions: system,
      input: user,
    });

    for await (const event of stream) {
      if (
        event.type === 'response.output_text.delta' &&
        typeof (event as { delta?: string }).delta === 'string'
      ) {
        yield (event as { delta: string }).delta;
      }
    }
  } catch (err) {
    console.error('[streamLLM] OpenAI call failed:', err);
    try {
      appendFileSync(
        'error.log',
        `\n[${new Date().toISOString()}] OpenAI call failed:\n${err}\n${err instanceof Error ? (err.stack ?? '') : ''}\n`,
      );
    } catch (logError) {
      console.error('[streamLLM] Failed to append OpenAI error to error.log:', logError);
    }
    throw err;
  }
}
