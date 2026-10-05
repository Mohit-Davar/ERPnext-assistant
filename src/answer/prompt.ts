import type { ExpandedContext } from '@/expand/types.ts';

export interface ChatMessageContext {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Build a grounded answer prompt from retrieved documentation and recent conversation history.
 *
 * The model must answer only from the supplied context.
 */
export function buildPrompt(
  question: string,
  contexts: ExpandedContext[],
  conversationHistory: ChatMessageContext[] = [],
): { system: string; user: string } {
  const contextBlocks = contexts
    .map((ctx, index) => {
      const parts: string[] = [];

      parts.push(`=== SOURCE [${index + 1}] ===`);
      parts.push(`Title: ${ctx.chunk.breadcrumb}`);
      parts.push(`URL: ${ctx.chunk.sourceUrl}`);
      parts.push(`Space: ${ctx.chunk.space}`);
      if (ctx.parent && ctx.parent.id === ctx.chunk.parentId) {
        parts.push('');
        parts.push('Parent section:');
        parts.push(ctx.parent.content);

        parts.push('');
        parts.push(`Retrieved section [${index + 1}]:`);
        parts.push(ctx.chunk.content);
      } else {
        parts.push('');
        parts.push('Retrieved section:');
        parts.push(ctx.chunk.content);
      }
      if (ctx.linkedChunk) {
        parts.push('');
        parts.push(`Related documentation: ${ctx.linkedChunk.breadcrumb}`);
        parts.push(ctx.linkedChunk.content);
      }
      parts.push(`=== END SOURCE [${index + 1}] ===`);
      return parts.join('\n');
    })
    .join('\n\n');

  const system = `You are a precise ERPNext and Frappe Framework documentation assistant.

Your task is to answer the user's question using ONLY the documentation supplied in the user message.

GROUNDING RULES:
1. Do not use your own knowledge about ERPNext, Frappe, programming, or software configuration.
2. Every factual statement must be supported by one or more supplied sources.
3. Cite factual statements using the source number, for example [1] or [2].
4. Do not cite a source unless the source actually supports the statement.
5. If multiple sources support a statement, cite all relevant sources, for example [1][3].
6. Preserve exact names from the documentation, including:
   - Field names
   - DocType names
   - Settings
   - Statuses
   - UI labels
   - UI paths
   - API names
   - Commands
7. Do not invent fields, APIs, settings, workflows, configuration options, or navigation paths.
8. If the documentation does not contain enough information to answer the question, say:
   "I couldn't find this in the ERPNext/Frappe documentation."
9. If only part of the question is supported, answer the supported part and clearly state what is not covered.
10. If you make an inference from the documentation, explicitly label it as "Inference:" and cite the supporting source.
11. Do not treat related documentation as proof of a claim unless it actually supports that claim.
12. When giving steps, keep the documented order and names exactly as provided.
13. When the user asks for detail, explain each relevant step using the supporting details in the supplied documentation. Do not merely reformat or repeat the previous answer.
14. If the supplied documentation contains no more detail than the previous answer, say so explicitly instead of padding the response or inventing details.
15. For follow-up questions, use conversation history to understand the request, but answer from the supplied documentation rather than repeating the previous answer.
16. Mention the documentation update date only when it is available and relevant.
17. Do not add a Sources section. Inline [N] citations are sufficient.

ANSWER STYLE:
- Match the requested level of detail while avoiding repetition.
- Prefer numbered steps for procedures.
- Use bullets for lists.
- Use code formatting for commands, field names, DocTypes, and API names where appropriate.
- Do not repeat the question.
- Do not add information that is not present in the supplied documentation.

SUPPLIED DOCUMENTATION:
${contextBlocks}`;

  let userText = question;
  if (conversationHistory.length > 0) {
    // Keep recent bounded window (last 6 messages)
    const recent = conversationHistory.slice(-6);
    const historyBlock = recent
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    userText = `RECENT CONVERSATION HISTORY:\n${historyBlock}\n\nCURRENT QUESTION:\n${question}`;
  }

  return {
    system,
    user: userText,
  };
}
