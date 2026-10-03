import { ingest, type IngestResult } from '@/pipeline.ts';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import React, { useState } from 'react';

interface IngestViewProps {
  isFocused: boolean;
  onUnfocus: () => void;
}

export function IngestView({ isFocused, onUnfocus }: IngestViewProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('Ready to index documentation');
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verbose, setVerbose] = useState(false);

  const startIngest = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setResult(null);
    setError(null);
    setLogs([]);

    try {
      const res = await ingest((msg) => {
        setCurrentStep(msg);
        setLogs((prev) => [...prev, msg]);
      });
      setResult(res);
      setCurrentStep('Ingestion complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCurrentStep('Ingestion failed');
    } finally {
      setIsRunning(false);
    }
  };

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.escape) {
      onUnfocus();
      return;
    }

    if (key.return && !isRunning) {
      startIngest();
      return;
    }

    if (input === 'v') {
      setVerbose((prev) => !prev);
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">
          Documentation Ingestion Pipeline
        </Text>
        <Box>
          <Text color="gray">
            Verbose:{' '}
            <Text bold color={verbose ? 'green' : 'gray'}>
              {verbose ? 'ON' : 'OFF'}
            </Text>{' '}
            [v]
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text color="gray">
          Processes Markdown files from the docs/ directory: parses frontmatter, extracts links,
          generates hierarchical chunks, enriches breadcrumbs, generates vector embeddings, and builds
          BM25 full-text search indexes.
        </Text>
      </Box>

      {/* Action / Trigger */}
      <Box marginY={1}>
        {!isRunning ? (
          <Box flexDirection="row">
            <Text bold color="cyan">
              [ Press ENTER to start ingestion ]
            </Text>
          </Box>
        ) : (
          <Box flexDirection="row">
            <Text color="yellow">
              <Spinner type="dots" />{' '}
            </Text>
            <Text color="yellow"> {currentStep}</Text>
          </Box>
        )}
      </Box>

      {/* Verbose logs or recent history */}
      {verbose && logs.length > 0 && (
        <Box flexDirection="column" marginY={1} paddingLeft={2}>
          <Text color="gray" dimColor>
            Progress logs:
          </Text>
          {logs.slice(-8).map((log, idx) => (
            <Text key={idx} color="gray">
              ✓ {log}
            </Text>
          ))}
        </Box>
      )}

      {/* Error state */}
      {error && (
        <Box marginY={1}>
          <Text color="red">✖ Ingestion error: {error}</Text>
        </Box>
      )}

      {/* Results Statistics */}
      {result && (
        <Box
          flexDirection="column"
          marginY={1}
          borderStyle="single"
          borderColor="green"
          paddingX={2}
          paddingY={1}
        >
          <Box marginBottom={1}>
            <Text bold color="green">
              ✔ Ingestion Complete
            </Text>
          </Box>

          <Box flexDirection="column">
            <Box justifyContent="space-between">
              <Text color="gray">Changed Documents:</Text>
              <Text bold color="white">{result.changed}</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text color="gray">Unchanged Documents:</Text>
              <Text color="white">{result.unchanged}</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text color="gray">Parsed Pages:</Text>
              <Text bold color="white">{result.parsed}</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text color="gray">Parent Sections (H2):</Text>
              <Text bold color="white">{result.parents}</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text color="gray">Child Search Chunks:</Text>
              <Text bold color="cyan">{result.children}</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text color="gray">Enriched Chunks:</Text>
              <Text bold color="white">{result.enriched}</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text color="gray">Extracted Doc Links:</Text>
              <Text bold color="white">{result.links}</Text>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
