import type { Message } from '@/history/types.ts';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

import { Markdown, tailText, truncate, useTerminalSize, wrappedLineCount } from './ui.tsx';

interface ChatViewProps {
  messages: Message[];
  isRetrieving: boolean;
  isStreaming: boolean;
  streamingText: string;
  error?: string | null;
  width: number;
}

const EXAMPLES = [
  'How do I create a Sales Invoice?',
  'What is a DocType in Frappe?',
  'FIFO vs Moving Average valuation',
  'How do I set up an Email Account?',
];

/** Rough height of a stored message, used to decide how much history fits on screen. */
function messageHeight(msg: Message, width: number): number {
  const body = wrappedLineCount(msg.content, width - 2);
  const sources = msg.citations && msg.citations.length > 0 ? 2 + msg.citations.length : 0;
  return body + sources + 1;
}

export function ChatView({
  messages,
  isRetrieving,
  isStreaming,
  streamingText,
  error,
  width,
}: ChatViewProps) {
  const { rows } = useTerminalSize();

  // Rows left for the conversation after header, input box and status bar.
  const budget = Math.max(6, rows - 13);
  const busy = isRetrieving || isStreaming;

  const live = isStreaming ? tailText(streamingText, width - 2, Math.max(3, budget - 4)) : null;
  const reserved = live ? wrappedLineCount(live.text, width - 2) + 3 : isRetrieving ? 2 : 0;

  // Show the newest messages that fit; always keep at least the latest one.
  let used = reserved + (error ? 2 : 0);
  let start = messages.length;
  while (start > 0) {
    const cost = messageHeight(messages[start - 1]!, width);
    if (start < messages.length && used + cost > budget) break;
    used += cost;
    start -= 1;
  }
  const visible = messages.slice(start);

  if (messages.length === 0 && !busy) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text>Ask me anything about ERPNext or the Frappe framework.</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Some ideas</Text>
          {EXAMPLES.map((example) => (
            <Text key={example} dimColor>
              {'  › '}
              {example}
            </Text>
          ))}
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">✖ {error}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {start > 0 && (
        <Box marginBottom={1}>
          <Text dimColor>
            ↑ {start} earlier {start === 1 ? 'message' : 'messages'}
          </Text>
        </Box>
      )}

      {visible.map((msg) => (
        <Box key={msg.id} flexDirection="column" marginBottom={1}>
          {msg.role === 'user' ? (
            <Box>
              <Box width={2}>
                <Text bold color="cyan">
                  ›
                </Text>
              </Box>
              <Box flexGrow={1}>
                <Text bold wrap="wrap">
                  {msg.content}
                </Text>
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Box>
                <Box width={2}>
                  <Text color="green">◈</Text>
                </Box>
                <Box flexGrow={1} flexDirection="column">
                  <Markdown text={msg.content} />
                </Box>
              </Box>

              {msg.citations && msg.citations.length > 0 && (
                <Box flexDirection="column" marginTop={1} paddingLeft={2}>
                  <Text dimColor>Sources</Text>
                  {msg.citations.map((c) => (
                    <Box key={c.index} flexDirection="column">
                      <Text>
                        <Text color="cyan">[{c.index}]</Text>{' '}
                        <Text dimColor>{truncate(c.section ?? '', width - 10)}</Text>
                      </Text>
                      {c.url && (
                        <Text dimColor>
                          {'    '}
                          {truncate(c.url, width - 8)}
                        </Text>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      ))}

      {isRetrieving && (
        <Box marginBottom={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> Reading the docs…</Text>
        </Box>
      )}

      {live && (
        <Box marginBottom={1}>
          <Box width={2}>
            <Text color="green">◈</Text>
          </Box>
          <Box flexGrow={1} flexDirection="column">
            {live.hidden > 0 && <Text dimColor>…</Text>}
            <Markdown text={live.text} />
          </Box>
        </Box>
      )}

      {error && (
        <Box marginBottom={1}>
          <Text color="red">✖ {error}</Text>
        </Box>
      )}
    </Box>
  );
}
