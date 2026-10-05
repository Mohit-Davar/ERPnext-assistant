import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import type { Citation } from '@/answer/types.ts';
import type { Conversation, ConversationSummary, Message } from '@/history/types.ts';
import type { Database } from '@/index/database.ts';
import { loadConfig } from '@/shared/config.ts';

function isStoredMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === 'string' &&
    typeof message.conversationId === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string' &&
    (message.citations === undefined || Array.isArray(message.citations))
  );
}

function isStoredConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false;
  const conversation = value as Record<string, unknown>;
  return (
    typeof conversation.id === 'string' &&
    typeof conversation.title === 'string' &&
    typeof conversation.createdAt === 'string' &&
    typeof conversation.updatedAt === 'string' &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every(isStoredMessage)
  );
}

function getHistoryPath(): string {
  const dbPath = resolve(loadConfig().dbPath);
  return resolve(dirname(dbPath), `${basename(dbPath)}.history.json`);
}

function readStoredConversations(): Conversation[] {
  const path = getHistoryPath();
  if (!existsSync(path)) return [];

  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Conversation history in ${path} must contain a JSON array.`);
  }
  if (!parsed.every(isStoredConversation)) {
    throw new Error(`Conversation history in ${path} contains invalid data.`);
  }
  return parsed;
}

function writeStoredConversations(conversations: Conversation[]): void {
  const path = getHistoryPath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(conversations, null, 2), 'utf8');
  renameSync(temporaryPath, path);
}

/**
 * Generate a clean, human-readable conversation title from the first question.
 * Truncates and strips leading/trailing quotes and redundant spaces.
 * Does not make any external LLM call.
 */
export function cleanTitle(question: string): string {
  const clean = question
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ');
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

  const conversations = readStoredConversations();
  conversations.push({ id, title, createdAt: now, updatedAt: now, messageCount: 0, messages: [] });
  writeStoredConversations(conversations);

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
  const storedConversations = readStoredConversations();
  const summaries = new Map<string, ConversationSummary>(
    storedConversations.map(({ messages, ...conversation }) => [
      conversation.id,
      { ...conversation, messageCount: messages.length },
    ]),
  );

  const rows = db
    .query<{ id: string; title: string; created_at: string; updated_at: string }, []>(
      `SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC`,
    )
    .all();

  for (const r of rows) {
    if (summaries.has(r.id)) continue;

    // Count messages without loading them into memory
    const countRow = db
      .query<{ id: string }, [string]>(`SELECT id FROM messages WHERE conversation_id = ?`)
      .all(r.id);

    summaries.set(r.id, {
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messageCount: countRow.length,
    });
  }

  return [...summaries.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Load a single conversation and its full message history.
 * Only called on demand when the conversation is opened.
 */
export function getConversation(db: Database, id: string): Conversation | null {
  const stored = readStoredConversations().find((conversation) => conversation.id === id);
  if (stored) return stored;

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
    >(
      `SELECT id, conversation_id, role, content, citations, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
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
  const conversations = readStoredConversations();
  let conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    const existing = getConversation(db, conversationId);
    if (!existing) {
      throw new Error(`Cannot add a message to missing conversation "${conversationId}".`);
    }
    conversation = { ...existing, messages: existing.messages };
    conversations.push(conversation);
  }

  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const citationsJson = citations && citations.length > 0 ? JSON.stringify(citations) : null;

  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, citations, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, conversationId, role, content, citationsJson, now);

  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);

  const message: Message = {
    id,
    conversationId,
    role,
    content,
    citations,
    createdAt: now,
  };
  conversation.messages.push(message);
  conversation.updatedAt = now;
  conversation.messageCount = conversation.messages.length;
  writeStoredConversations(conversations);

  return message;
}

/**
 * Delete a conversation and all its messages.
 */
export function deleteConversation(db: Database, id: string): void {
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  writeStoredConversations(
    readStoredConversations().filter((conversation) => conversation.id !== id),
  );
}
