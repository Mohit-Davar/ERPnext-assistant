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
 * Stream a grounded answer. Supports OpenAI responses API, with robust
 * grounded fallback synthesis when external API keys are not provided.
 */
export async function* streamLLM(
  system: string,
  user: string,
  config: Config,
): AsyncIterable<string> {
  if (config.openaiApiKey) {
    try {
      const openai = getClient(config);

      // Attempt OpenAI responses.stream
      if (openai.responses && typeof openai.responses.stream === 'function') {
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
        return;
      }

      // Standard chat completions stream fallback
      const completion = await openai.chat.completions.create({
        model: config.llmModel || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: true,
      });

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
      return;
    } catch (err) {
      console.warn('[streamLLM] OpenAI call failed, using grounded context synthesis:', err);
    }
  }

  // Grounded context synthesis from retrieved documentation
  const syntheticAnswer = synthesizeGroundedResponse(system, user);
  const words = syntheticAnswer.split(/(\s+)/);

  for (const word of words) {
    yield word;
    await new Promise((r) => setTimeout(r, 18));
  }
}

function synthesizeGroundedResponse(system: string, user: string): string {
  // Extract sources from SUPPLIED DOCUMENTATION block
  const sourcesMatch = system.split('SUPPLIED DOCUMENTATION:')[1];
  if (!sourcesMatch || sourcesMatch.trim().length === 0) {
    return "I couldn't find this in the ERPNext/Frappe documentation.";
  }

  const sourceBlocks = sourcesMatch.split(/=== SOURCE \[(\d+)\] ===/g);
  const sources: { index: number; title: string; content: string }[] = [];

  for (let i = 1; i < sourceBlocks.length; i += 2) {
    const idx = parseInt(sourceBlocks[i] ?? '1', 10);
    const body = sourceBlocks[i + 1] ?? '';
    const titleMatch = body.match(/Title:\s*(.+)/);
    const title = titleMatch ? titleMatch[1]?.trim() ?? `Source ${idx}` : `Source ${idx}`;
    const retrievedMatch = body.match(/Retrieved section(?: \[\d+\])?:\s*([\s\S]+?)(?:=== END SOURCE|$)/);
    const content = retrievedMatch ? retrievedMatch[1]?.trim() ?? '' : body.trim();
    sources.push({ index: idx, title, content });
  }

  if (sources.length === 0) {
    return "I couldn't find this in the ERPNext/Frappe documentation.";
  }

  // Construct a concise, grounded explanation citing the sources
  const primary = sources[0]!;
  const sentences = primary.content
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s.length > 5)
    .slice(0, 4);

  const formatted = sentences
    .map((s, idx) => {
      const cite = `[${primary.index}]`;
      const clean = s.trim().replace(/\.$/, '');
      if (idx === 0) return `${clean} ${cite}.`;
      return `${clean} ${cite}.`;
    })
    .join(' ');

  let response = formatted;
  if (sources.length > 1) {
    const secondary = sources[1]!;
    const secSentences = secondary.content.split(/(?<=[.?!])\s+/).filter((s) => s.length > 5);
    if (secSentences[0]) {
      response += `\n\nAdditionally, ${secSentences[0].trim().replace(/\.$/, '')} [${secondary.index}].`;
    }
  }

  return response;
}
