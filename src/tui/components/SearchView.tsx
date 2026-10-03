import { search, type SearchResult } from '@/pipeline.ts';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';

interface SearchViewProps {
  isFocused: boolean;
  onUnfocus: () => void;
}

export function SearchView({ isFocused, onUnfocus }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedResult, setExpandedResult] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<'input' | 'list'>('input');

  const handleSearch = async (val: string) => {
    const q = val.trim();
    if (!q) return;

    setIsLoading(true);
    setError(null);
    setExpandedResult(null);

    try {
      const res = await search(q, 10);
      setResults(res);
      setHasSearched(true);
      setSelectedIndex(0);
      if (res.length > 0) {
        setFocusMode('list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useInput((input, key) => {
    if (!isFocused) return;

    // Handle escape
    if (key.escape) {
      if (expandedResult) {
        setExpandedResult(null);
        return;
      }
      if (focusMode === 'list') {
        setFocusMode('input');
        return;
      }
      onUnfocus();
      return;
    }

    // List navigation when results are focused
    if (focusMode === 'list' && !expandedResult && results.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        return;
      }
      if (key.return) {
        const item = results[selectedIndex];
        if (item) {
          setExpandedResult(item);
        }
        return;
      }
      if (input === '/' || input === 'i') {
        setFocusMode('input');
        return;
      }
    }

    // If expanded, enter or esc goes back
    if (expandedResult && (key.return || key.escape)) {
      setExpandedResult(null);
      return;
    }
  });

  return (
    <Box flexDirection="column">
      {/* Search Input Bar */}
      <Box
        flexDirection="row"
        borderStyle="single"
        borderColor={isFocused && focusMode === 'input' ? 'cyan' : 'gray'}
        paddingX={1}
      >
        <Text color="cyan" bold>
          {'⌕ '}
        </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSearch}
          placeholder="Search documentation (e.g., Sales Invoice, DocType, valuation, scripts)…"
          focus={isFocused && focusMode === 'input'}
        />
      </Box>

      {/* Loading state */}
      {isLoading && (
        <Box flexDirection="row" marginY={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow"> Searching documentation chunks via hybrid retrieval…</Text>
        </Box>
      )}

      {/* Error state */}
      {error && (
        <Box marginY={1}>
          <Text color="red">✖ Error: {error}</Text>
        </Box>
      )}

      {/* Expanded detail view */}
      {expandedResult && (
        <Box
          flexDirection="column"
          marginY={1}
          borderStyle="round"
          borderColor="cyan"
          padding={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color="cyan">
              {expandedResult.breadcrumb}
            </Text>
            <Text color="yellow">Score: {expandedResult.rerankScore.toFixed(4)}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">
              Space: <Text bold color="white">{expandedResult.space}</Text>
              {expandedResult.ui_path && (
                <> │ UI: <Text color="gray">{expandedResult.ui_path}</Text></>
              )}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text wrap="wrap">{expandedResult.content}</Text>
          </Box>
          {expandedResult.source_url && (
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                URL: {expandedResult.source_url}
              </Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              [Esc / Enter] Close detail view
            </Text>
          </Box>
        </Box>
      )}

      {/* Results List */}
      {!expandedResult && results.length > 0 && (
        <Box flexDirection="column" marginY={1}>
          <Box marginBottom={1} justifyContent="space-between">
            <Text color="gray">
              Found <Text bold color="white">{results.length}</Text> documentation matches:
            </Text>
            <Text color="gray" dimColor>
              {focusMode === 'list'
                ? '[↑/↓] Select  [Enter] View  [/] Edit query'
                : '[Press ↓ to navigate results]'}
            </Text>
          </Box>

          {results.map((r, idx) => {
            const isSelected = focusMode === 'list' && idx === selectedIndex;
            const preview =
              r.content.length > 120
                ? r.content.slice(0, 117).replace(/\n+/g, ' ') + '...'
                : r.content.replace(/\n+/g, ' ');

            return (
              <Box
                key={r.chunkId}
                flexDirection="column"
                marginBottom={1}
                paddingLeft={1}
                borderStyle={isSelected ? 'single' : undefined}
                borderColor={isSelected ? 'cyan' : undefined}
              >
                <Box>
                  <Text bold color={isSelected ? 'cyan' : 'white'}>
                    {isSelected ? '▶ ' : '  '}
                    {idx + 1}. {r.breadcrumb}
                  </Text>
                  <Text color="gray"> │ </Text>
                  <Text color="green">{r.rerankScore.toFixed(3)}</Text>
                  <Text color="gray"> │ </Text>
                  <Text color="yellow">[{r.space}]</Text>
                </Box>
                <Box paddingLeft={3}>
                  <Text color="gray" wrap="wrap">
                    {preview}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* No results */}
      {!isLoading && hasSearched && results.length === 0 && !error && (
        <Box marginY={1}>
          <Text color="yellow">⚠ No matching documentation found for "{query}".</Text>
        </Box>
      )}
    </Box>
  );
}
