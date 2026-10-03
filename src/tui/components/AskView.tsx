import { extractAndVerifyCitations } from '@/answer/citations.ts';
import { generateAnswerStream } from '@/answer/index.ts';
import { expandResults } from '@/expand/index.ts';
import { addMessage, createConversation, getConversation } from '@/history/index.ts';
import type { Message } from '@/history/types.ts';
import { openDatabase } from '@/index/database.ts';
import { hybridRetrieve } from '@/retrieve/index.ts';
import { loadConfig } from '@/shared/config.ts';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React, { useEffect, useState } from 'react';

import { ChatView } from './ChatView.tsx';

interface AskViewProps {
  conversationId: string | null;
  onConversationChange: (id: string | null) => void;
  isFocused: boolean;
  onUnfocus: () => void;
}

export function AskView({
  conversationId,
  onConversationChange,
  isFocused,
  onUnfocus,
}: AskViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const config = loadConfig();
  const db = openDatabase(config.dbPath);

  // Load conversation messages when conversationId changes
  useEffect(() => {
    if (conversationId) {
      const conv = getConversation(db, conversationId);
      if (conv) {
        setMessages(conv.messages);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.escape) {
      onUnfocus();
      return;
    }

    if (input === 'n' && !isStreaming && !isRetrieving && inputVal === '') {
      // Start new conversation
      onConversationChange(null);
      setMessages([]);
      return;
    }
  });

  const handleSubmit = async (text: string) => {
    const question = text.trim();
    if (!question || isRetrieving || isStreaming) return;

    setInputVal('');
    setError(null);

    let currentConvId = conversationId;

    // 1. Create conversation if new
    if (!currentConvId) {
      const newConv = createConversation(db, question);
      currentConvId = newConv.id;
      onConversationChange(currentConvId);
    }

    // 2. Add user message
    const userMsg = addMessage(db, currentConvId, 'user', question);
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      // 3. Retrieve relevant documentation
      setIsRetrieving(true);
      const reranked = await hybridRetrieve(db, question, config, 15);
      const contexts = expandResults(db, reranked);
      setIsRetrieving(false);

      // 4. Stream LLM answer with bounded history
      setIsStreaming(true);
      setStreamingText('');

      const historyContext = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const streamGen = generateAnswerStream(question, contexts, config, historyContext);
      let accumulated = '';

      let step = await streamGen.next();
      while (!step.done) {
        accumulated += step.value;
        setStreamingText(accumulated);
        step = await streamGen.next();
      }

      const finalAnswer = step.value;
      const { citations } = extractAndVerifyCitations(accumulated, contexts);

      // 5. Save assistant message with citations to database
      const assistantMsg = addMessage(
        db,
        currentConvId,
        'assistant',
        accumulated,
        citations.length > 0 ? citations : finalAnswer.citations,
      );

      setMessages((prev) => [...prev, assistantMsg]);
      setIsStreaming(false);
      setStreamingText('');
    } catch (err) {
      setIsRetrieving(false);
      setIsStreaming(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Box flexDirection="column">
      {/* Scrollable / Stacked Chat view */}
      <ChatView
        messages={messages}
        isRetrieving={isRetrieving}
        isStreaming={isStreaming}
        streamingText={streamingText}
        error={error}
      />

      {/* Input box */}
      <Box
        flexDirection="row"
        marginTop={1}
        borderStyle="single"
        borderColor={isFocused ? 'cyan' : 'gray'}
        paddingX={1}
      >
        <Text color="cyan" bold>
          {'? '}
        </Text>
        <TextInput
          value={inputVal}
          onChange={setInputVal}
          onSubmit={handleSubmit}
          placeholder={
            isStreaming || isRetrieving
              ? 'Generating answer…'
              : 'Ask a question about ERPNext or Frappe documentation…'
          }
          focus={isFocused && !isStreaming && !isRetrieving}
        />
      </Box>

      {/* Helper cue */}
      <Box justifyContent="space-between" marginTop={0}>
        <Text color="gray" dimColor>
          {isFocused
            ? '[Enter] Send  [Esc] Unfocus to switch tabs  [n] New Conversation'
            : '[Press Enter or / to type]  [←/→] Switch tabs'}
        </Text>
        {conversationId && (
          <Text color="gray" dimColor>
            Conv: {conversationId.slice(0, 14)}
          </Text>
        )}
      </Box>
    </Box>
  );
}
