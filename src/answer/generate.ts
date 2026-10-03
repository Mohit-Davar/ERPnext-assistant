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
 * Stream a grounded answer using OpenAI's Responses API, yielding text deltas
 * as they arrive. The final yielded chunk is always an empty string signalling
 * end-of-stream; the caller should concatenate all chunks to build the full text.
 */
export async function* streamLLM(
  system: string,
  user: string,
  config: Config,
): AsyncIterable<string> {
  const openai = getClient(config);

  const stream = await openai.responses.stream({
    model: config.llmModel,
    instructions: system,
    input: user,
  });

  for await (const event of stream) {
    // The SDK emits response.output_text.delta events for streaming text
    if (
      event.type === 'response.output_text.delta' &&
      typeof (event as { delta?: string }).delta === 'string'
    ) {
      yield (event as { delta: string }).delta;
    }
  }
}
