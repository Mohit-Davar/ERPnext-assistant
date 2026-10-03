import type { Citation } from '@/answer/types.ts';
import type { Message } from '@/history/types.ts';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React from 'react';

interface ChatViewProps {
  messages: Message[];
  isRetrieving: boolean;
  isStreaming: boolean;
  streamingText: string;
  error?: string | null;
}

export function ChatView({
  messages,
  isRetrieving,
  isStreaming,
  streamingText,
  error,
}: ChatViewProps) {
  return (
    <Box flexDirection="column">
      {messages.length === 0 && !isRetrieving && !isStreaming && (
        <Box flexDirection="column" marginY={1}>
          <Text color="gray">
            Ask any question about ERPNext or Frappe Framework documentation.
          </Text>
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
            <Text color="gray" dimColor>Example questions:</Text>
            <Text color="gray">• How to create a Sales Invoice in ERPNext?</Text>
            <Text color="gray">• What is a DocType in Frappe Framework?</Text>
            <Text color="gray">• Valuation methods: FIFO vs Moving Average?</Text>
            <Text color="gray">• How to configure Email Accounts?</Text>
          </Box>
        </Box>
      )}

      {/* Render historical messages in conversation */}
      {messages.map((msg) => (
        <Box key={msg.id} flexDirection="column" marginBottom={1}>
          {msg.role === 'user' ? (
            <Box flexDirection="column">
              <Text bold color="cyan">
                {'> '}You
              </Text>
              <Box paddingLeft={2}>
                <Text wrap="wrap">{msg.content}</Text>
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text bold color="green">
                ◈ Assistant
              </Text>
              <Box paddingLeft={2}>
                <Text wrap="wrap">{msg.content}</Text>
              </Box>

              {/* Citations below assistant answer */}
              {msg.citations && msg.citations.length > 0 && (
                <Box flexDirection="column" marginTop={1} paddingLeft={2}>
                  <Text color="gray" dimColor>
                    Sources:
                  </Text>
                  {msg.citations.map((c) => (
                    <Box key={c.index} flexDirection="column" paddingLeft={1}>
                      <Text>
                        <Text color="cyan" bold>
                          [{c.index}]
                        </Text>{' '}
                        <Text color="gray">{c.section}</Text>
                      </Text>
                      {c.url && (
                        <Text color="gray" dimColor>
                          {'    '}{c.url}
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

      {/* Retrieval phase */}
      {isRetrieving && (
        <Box flexDirection="row" marginY={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow"> Retrieving relevant documentation and expanding context…</Text>
        </Box>
      )}

      {/* Live streaming text for active turn */}
      {isStreaming && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text bold color="green">
              ◈ Assistant{' '}
            </Text>
            <Text color="gray">
              <Spinner type="arc" />
            </Text>
          </Box>
          <Box paddingLeft={2}>
            <Text wrap="wrap">{streamingText}</Text>
          </Box>
        </Box>
      )}

      {/* Error message */}
      {error && (
        <Box marginY={1}>
          <Text color="red">✖ Error: {error}</Text>
        </Box>
      )}
    </Box>
  );
}
