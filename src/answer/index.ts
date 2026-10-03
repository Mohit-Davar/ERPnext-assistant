import { checkNotFound, extractAndVerifyCitations } from '@/answer/citations.ts';
import { streamLLM } from '@/answer/generate.ts';
import { buildPrompt } from '@/answer/prompt.ts';
import type { Answer } from '@/answer/types.ts';
import type { ExpandedContext } from '@/expand/types.ts';
import type { Config } from '@/shared/types.ts';

export { buildPrompt } from '@/answer/prompt.ts';
export { streamLLM } from '@/answer/generate.ts';
export { extractAndVerifyCitations } from '@/answer/citations.ts';
export type { Answer, Citation } from '@/answer/types.ts';

/**
 * Stream a grounded answer. Yields text deltas as they arrive from the LLM.
 * After the stream ends, the generator returns the fully resolved Answer.
 *
 * To get both deltas AND the final Answer, use the generator directly:
 *   const gen = streamAnswer(...);
 *   let result = await gen.next();
 *   while (!result.done) { write(result.value); result = await gen.next(); }
 *   const answer = result.value; // Answer
 */
export async function* streamAnswer(
  question: string,
  contexts: ExpandedContext[],
  config: Config,
): AsyncGenerator<string, Answer> {
  if (contexts.length === 0) {
    return {
      question,
      text: "I couldn't find this in the ERPNext/Frappe documentation.",
      citations: [],
      found: false,
      grounded: false,
    };
  }

  const { system, user } = buildPrompt(question, contexts);
  let fullText = '';

  for await (const delta of streamLLM(system, user, config)) {
    fullText += delta;
    yield delta;
  }

  const { citations, grounded } = extractAndVerifyCitations(fullText, contexts);
  const found = !checkNotFound(fullText);

  return { question, text: fullText, citations, found, grounded };
}
