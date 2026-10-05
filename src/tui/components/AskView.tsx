import { extractAndVerifyCitations } from '@/answer/citations.ts';
import { addMessage, createConversation, getConversation } from '@/history/index.ts';
import type { Message } from '@/history/types.ts';
import { askStream } from '@/pipeline.ts';
import { Box, Text, useInput, useStdin } from 'ink';
import TextInput from 'ink-text-input';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatView } from './ChatView.tsx';
import { getDb } from './db.ts';

interface AskViewProps {
  conversationId: string | null;
  onConversationChange: (id: string) => void;
  isFocused: boolean;
  onUnfocus: () => void;
  width: number;
}

type Phase = 'idle' | 'retrieving' | 'streaming';

// The resolved value of askStream's generator, without guessing its type name.
type Answer =
  ReturnType<typeof askStream> extends AsyncGenerator<unknown, infer R, unknown> ? R : never;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function AskView({
  conversationId,
  onConversationChange,
  isFocused,
  onUnfocus,
  width,
}: AskViewProps) {
  const { isRawModeSupported } = useStdin();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The conversation whose messages are currently in local state. Starting a chat
  // here updates this first, so the load effect below doesn't re-read (and
  // duplicate) messages we already hold.
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId === activeIdRef.current) return;
    activeIdRef.current = conversationId;

    if (!conversationId) {
      setMessages([]);
      setError(null);
      return;
    }
    try {
      const conv = getConversation(getDb(), conversationId);
      setMessages(conv?.messages ?? []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [conversationId]);

  const handleSubmit = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || phase !== 'idle') return;

      setInput('');
      setError(null);

      try {
        const db = getDb();

        let convId = activeIdRef.current;
        if (!convId) {
          convId = createConversation(db, trimmed).id;
          activeIdRef.current = convId;
          onConversationChange(convId);
        }

        // History for the model is everything before this question.
        const history = messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const userMsg = addMessage(db, convId, 'user', trimmed);
        setMessages((prev) => [...prev, userMsg]);
        setPhase('retrieving');
        setStreamingText('');

        // Drive the generator by hand: for-await would discard its return value.
        const generator = askStream(trimmed, history);
        let accumulated = '';
        let finalAnswer: Answer | undefined;
        let first = true;

        for (;;) {
          const step = await generator.next();
          if (step.done) {
            finalAnswer = step.value as Answer;
            break;
          }
          if (first) {
            setPhase('streaming');
            first = false;
          }
          accumulated += step.value as string;
          setStreamingText(accumulated);
        }

        const { citations } = finalAnswer
          ? { citations: finalAnswer.citations }
          : extractAndVerifyCitations(accumulated, []);

        const assistantMsg = addMessage(
          db,
          convId,
          'assistant',
          finalAnswer?.text ?? accumulated,
          citations,
        );
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setStreamingText('');
        setPhase('idle');
      }
    },
    [phase, messages, onConversationChange],
  );

  useInput(
    (inp, key) => {
      if (key.escape) {
        onUnfocus();
        return;
      }
      if (key.ctrl && inp === 'n' && phase === 'idle') {
        activeIdRef.current = null;
        onConversationChange('');
        setMessages([]);
        setInput('');
        setError(null);
      }
    },
    { isActive: isRawModeSupported && isFocused },
  );

  const idle = phase === 'idle';
  const placeholder = !idle
    ? 'Thinking…'
    : isFocused
      ? 'Ask about ERPNext or Frappe…'
      : 'Press enter to type';

  return (
    <Box flexDirection="column">
      <ChatView
        messages={messages}
        isRetrieving={phase === 'retrieving'}
        isStreaming={phase === 'streaming'}
        streamingText={streamingText}
        error={error}
        width={width}
      />

      <Box
        borderStyle="round"
        borderColor={isFocused && idle ? 'cyan' : 'gray'}
        paddingX={1}
        width={width}
      >
        <Text bold color={isFocused && idle ? 'cyan' : 'gray'}>
          {'› '}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={placeholder}
          focus={isFocused && idle}
        />
      </Box>
    </Box>
  );
}
