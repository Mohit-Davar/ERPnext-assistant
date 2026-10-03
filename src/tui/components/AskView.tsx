import type { Answer } from '@/answer/types.ts';
import { askStream } from '@/pipeline.ts';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React, { useEffect, useState } from 'react';

import { Header } from './Header.tsx';

type Phase = 'retrieving' | 'streaming' | 'done' | 'error';

interface AskViewProps {
  question: string;
  onDone: () => void;
}

export function AskView({ question, onDone }: AskViewProps) {
  const [phase, setPhase] = useState<Phase>('retrieving');
  const [streamedText, setStreamedText] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Fire onDone only AFTER React has painted the done/error state
  useEffect(() => {
    if (phase === 'done' || phase === 'error') {
      onDone();
    }
  }, [phase]);

  useEffect(() => {
    async function run() {
      try {
        const gen = askStream(question);
        setPhase('retrieving');

        // First next() call triggers retrieval; until it yields the LLM has not started
        let step = await gen.next();

        // Once we get first delta the retrieval is done
        setPhase('streaming');

        let accumulated = '';
        while (!step.done) {
          accumulated += step.value;
          setStreamedText(accumulated);
          step = await gen.next();
        }

        setAnswer(step.value);
        setPhase('done');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    }

    run();
  }, [question]);

  return (
    <Box flexDirection="column">
      <Header subtitle={`ask: ${question}`} />

      {/* Retrieval phase */}
      {phase === 'retrieving' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow"> Retrieving relevant documentation…</Text>
        </Box>
      )}

      {/* Streaming / done answer text */}
      {(phase === 'streaming' || phase === 'done') && streamedText && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text bold color="greenBright">
              Answer
            </Text>
            {phase === 'streaming' && (
              <Text color="gray">
                {' '}
                <Spinner type="arc" />
              </Text>
            )}
          </Box>
          <Box paddingLeft={2}>
            <Text wrap="wrap">{streamedText}</Text>
          </Box>
        </Box>
      )}

      {/* Citations */}
      {phase === 'done' && answer && answer.citations.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color="gray" dimColor>
              {'─'.repeat(50)}
            </Text>
          </Box>
          <Box marginTop={1} marginBottom={1}>
            <Text bold color="cyanBright">
              Sources
            </Text>
          </Box>
          {answer.citations.map((c) => (
            <Box key={c.index} flexDirection="column" marginBottom={1} paddingLeft={2}>
              <Text>
                <Text color="cyanBright" bold>
                  [{c.index}]
                </Text>
                <Text> {c.section}</Text>
              </Text>
              {c.url && (
                <Text color="gray" dimColor>
                  {c.url}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Not found */}
      {phase === 'done' && answer && !answer.found && (
        <Box marginTop={1}>
          <Text color="yellowBright">⚠ No supporting documentation found.</Text>
        </Box>
      )}

      {/* Error */}
      {phase === 'error' && (
        <Box>
          <Text color="red">✖ {errorMsg}</Text>
        </Box>
      )}
    </Box>
  );
}
