import { checkNotFound, extractAndVerifyCitations } from '@/answer/citations.ts';
import { streamLLM } from '@/answer/generate.ts';
import { buildPrompt, type ChatMessageContext } from '@/answer/prompt.ts';
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
 * Supports bounded conversation history for follow-up questions.
 */
export async function* generateAnswerStream(
  question: string,
  contexts: ExpandedContext[],
  config: Config,
  conversationHistory: ChatMessageContext[] = [],
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

  const { system, user } = buildPrompt(question, contexts, conversationHistory);
  let fullText = '';

  for await (const delta of streamLLM(system, user, config)) {
    fullText += delta;
    yield delta;
  }

  const { citations, grounded } = extractAndVerifyCitations(fullText, contexts);
  const found = !checkNotFound(fullText);

  return { question, text: fullText, citations, found, grounded };
}

/**
 * Legacy alias for generateAnswerStream.
 */
export const streamAnswer = generateAnswerStream;

/**
 * Generate a complete grounded answer synchronously.
 */
export async function generateAnswer(
  question: string,
  contexts: ExpandedContext[],
  config: Config,
  conversationHistory: ChatMessageContext[] = [],
): Promise<Answer> {
  const gen = generateAnswerStream(question, contexts, config, conversationHistory);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}
