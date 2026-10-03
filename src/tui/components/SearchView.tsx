import { search, type SearchResult } from '@/pipeline.ts';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React, { useEffect, useState } from 'react';

import { Header } from './Header.tsx';

interface SearchViewProps {
  query: string;
  onDone: () => void;
}

export function SearchView({ query, onDone }: SearchViewProps) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Fire onDone only AFTER React has painted the final state
  useEffect(() => {
    if (!loading) {
      onDone();
    }
  }, [loading]);

  useEffect(() => {
    search(query)
      .then((r) => {
        setResults(r);
        setLoading(false);
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [query]);

  return (
    <Box flexDirection="column">
      <Header subtitle={`search: ${query}`} />

      {loading && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow"> Searching documentation…</Text>
        </Box>
      )}

      {!loading && errorMsg && (
        <Box>
          <Text color="red">✖ {errorMsg}</Text>
        </Box>
      )}

      {!loading && !errorMsg && results.length === 0 && (
        <Text color="yellowBright">⚠ No results found.</Text>
      )}

      {!loading && results.length > 0 && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="greenBright">
              Results for{' '}
            </Text>
            <Text bold>"{query}"</Text>
          </Box>

          {results.map((r, i) => (
            <Box key={r.chunkId} flexDirection="column" marginBottom={1} paddingLeft={2}>
              <Box>
                <Text color="cyanBright" bold>
                  {i + 1}.{' '}
                </Text>
                <Text bold>{r.breadcrumb}</Text>
              </Box>
              <Box paddingLeft={3}>
                <Text color="gray">Score: </Text>
                <Text color="greenBright">{r.rerankScore.toFixed(4)}</Text>
                {r.space ? (
                  <>
                    <Text color="gray"> Space: </Text>
                    <Text>{r.space}</Text>
                  </>
                ) : null}
              </Box>
              {r.source_url && (
                <Box paddingLeft={3}>
                  <Text color="gray" dimColor>
                    {r.source_url}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
