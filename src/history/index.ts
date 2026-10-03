import type { Citation } from '@/answer/types.ts';
import type { Conversation, ConversationSummary, Message } from '@/history/types.ts';
import type { Database } from '@/index/database.ts';

/**
 * Generate a clean, human-readable conversation title from the first question.
 * Truncates and strips leading/trailing quotes and redundant spaces.
 * Does not make any external LLM call.
 */
export function cleanTitle(question: string): string {
  const clean = question.trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ');
  if (!clean) return 'New Conversation';
  if (clean.length <= 45) return clean;
  return clean.slice(0, 42).trim() + '...';
}

/**
 * Create a new conversation in the database.
 */
export function createConversation(db: Database, firstQuestion: string): ConversationSummary {
  const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = cleanTitle(firstQuestion);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run(id, title, now, now);

  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
}

/**
 * List all conversations sorted by most recently updated.
 * Does NOT load message bodies to keep memory and query overhead minimal.
 */
export function listConversations(db: Database): ConversationSummary[] {
  const rows = db
    .query<{ id: string; title: string; created_at: string; updated_at: string }, []>(
      `SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC`,
    )
    .all();

  return rows.map((r) => {
    // Count messages without loading them into memory
    const countRow = db
      .query<{ id: string }, [string]>(`SELECT id FROM messages WHERE conversation_id = ?`)
      .all(r.id);

    return {
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messageCount: countRow.length,
    };
  });
}

/**
 * Load a single conversation and its full message history.
 * Only called on demand when the conversation is opened.
 */
export function getConversation(db: Database, id: string): Conversation | null {
  const conv = db
    .query<{ id: string; title: string; created_at: string; updated_at: string }, [string]>(
      `SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?`,
    )
    .get(id);

  if (!conv) {
    return null;
  }

  const rawMessages = db
    .query<
      {
        id: string;
        conversation_id: string;
        role: 'user' | 'assistant';
        content: string;
        citations: string | null;
        created_at: string;
      },
      [string]
    >(`SELECT id, conversation_id, role, content, citations, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`)
    .all(id);

  const messages: Message[] = rawMessages.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    citations: m.citations ? (JSON.parse(m.citations) as Citation[]) : undefined,
    createdAt: m.created_at,
  }));

  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
    messageCount: messages.length,
    messages,
  };
}

/**
 * Add a user or assistant message to a conversation and bump updated_at timestamp.
 */
export function addMessage(
  db: Database,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  citations?: Citation[],
): Message {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const citationsJson = citations && citations.length > 0 ? JSON.stringify(citations) : null;

  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, citations, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, conversationId, role, content, citationsJson, now);

  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);

  return {
    id,
    conversationId,
    role,
    content,
    citations,
    createdAt: now,
  };
}

/**
 * Delete a conversation and all its messages.
 */
export function deleteConversation(db: Database, id: string): void {
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}
