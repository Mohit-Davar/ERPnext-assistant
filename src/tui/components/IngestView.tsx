import { ingest, type IngestResult } from '@/pipeline.ts';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React, { useEffect, useState } from 'react';

import { Header } from './Header.tsx';

interface IngestViewProps {
  verbose: boolean;
  onDone: () => void;
}

export function IngestView({ verbose, onDone }: IngestViewProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  // Fire onDone only AFTER React has painted the final state
  useEffect(() => {
    if (done) {
      onDone();
    }
  }, [done]);

  useEffect(() => {
    ingest((msg) => {
      if (verbose) {
        setLogs((prev) => [...prev, msg]);
      } else {
        setLogs([msg]);
      }
    })
      .then((r) => {
        setResult(r);
        setDone(true);
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setDone(true);
      });
  }, []);

  return (
    <Box flexDirection="column">
      <Header subtitle="ingest" />

      {/* Progress log */}
      {!done && logs.length > 0 && (
        <Box marginBottom={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow"> {logs[logs.length - 1]}</Text>
        </Box>
      )}

      {/* Verbose log history */}
      {verbose &&
        logs.slice(0, -1).map((l, i) => (
          <Box key={i} paddingLeft={2}>
            <Text color="gray" dimColor>
              ✓ {l}
            </Text>
          </Box>
        ))}

      {errorMsg && (
        <Box>
          <Text color="red">✖ {errorMsg}</Text>
        </Box>
      )}

      {done && result && (
        <Box flexDirection="column">
          <Box>
            <Text color="greenBright" bold>
              ✔ Ingestion complete
            </Text>
          </Box>

          {result.changed === 0 ? (
            <Box paddingLeft={2} marginTop={1}>
              <Text color="gray">
                No new or updated documents. Checked {result.unchanged} file
                {result.unchanged !== 1 ? 's' : ''}.
              </Text>
            </Box>
          ) : (
            <Box flexDirection="column" paddingLeft={2} marginTop={1}>
              <Box>
                <Text color="gray">{'─'.repeat(30)}</Text>
              </Box>
              <Box>
                <Text color="gray">Documents </Text>
                <Text bold>{result.changed}</Text>
                <Text color="gray"> changed, </Text>
                <Text>{result.unchanged}</Text>
                <Text color="gray"> unchanged</Text>
              </Box>
              <Box>
                <Text color="gray">Parsed </Text>
                <Text bold>{result.parsed}</Text>
              </Box>
              <Box>
                <Text color="gray">Chunks </Text>
                <Text bold>{result.parents}</Text>
                <Text color="gray"> parents, </Text>
                <Text bold>{result.children}</Text>
                <Text color="gray"> children</Text>
              </Box>
              <Box>
                <Text color="gray">Enriched </Text>
                <Text bold>{result.enriched}</Text>
              </Box>
              <Box>
                <Text color="gray">Links </Text>
                <Text bold>{result.links}</Text>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
