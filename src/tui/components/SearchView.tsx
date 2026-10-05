import { search, type SearchResult } from '@/pipeline.ts';
import { Box, Text, useInput, useStdin } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { useState } from 'react';

import { Markdown, truncate, useTerminalSize } from './ui.tsx';

interface SearchViewProps {
  isFocused: boolean;
  onUnfocus: () => void;
  width: number;
}

type FocusMode = 'input' | 'list';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function SearchView({ isFocused, onUnfocus, width }: SearchViewProps) {
  const { isRawModeSupported } = useStdin();
  const { rows } = useTerminalSize();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expanded, setExpanded] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>('input');

  const handleSearch = async (value: string) => {
    const q = value.trim();
    if (!q || isLoading) return;

    setIsLoading(true);
    setError(null);
    setExpanded(null);

    try {
      const found = await search(q, 10);
      setResults(found);
      setHasSearched(true);
      setSelectedIndex(0);
      if (found.length > 0) setFocusMode('list');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        if (expanded) setExpanded(null);
        else if (focusMode === 'list') setFocusMode('input');
        else onUnfocus();
        return;
      }

      if (expanded) {
        if (key.return) setExpanded(null);
        return;
      }

      if (focusMode === 'input') {
        if (key.downArrow && results.length > 0) setFocusMode('list');
        return;
      }

      // List mode
      if (results.length === 0) return;
      if (key.upArrow) {
        setSelectedIndex((i) => (i > 0 ? i - 1 : results.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : 0));
      } else if (key.return) {
        const item = results[selectedIndex];
        if (item) setExpanded(item);
      } else if (input === '/' || input === 'i') {
        setFocusMode('input');
      }
    },
    { isActive: isFocused && isRawModeSupported },
  );

  // Each result takes three rows (title, preview, gap).
  const rowsForList = Math.max(6, rows - 14);
  const visibleCount = Math.max(2, Math.floor(rowsForList / 3));
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleCount / 2), results.length - visibleCount),
  );
  const visibleResults = results.slice(windowStart, windowStart + visibleCount);

  const inputActive = isFocused && focusMode === 'input' && !isLoading && !expanded;

  // Detail view: cap the body so it never pushes the layout off screen.
  const bodyLines = expanded ? expanded.content.split('\n') : [];
  const maxBody = Math.max(5, rows - 17);
  const bodyText = bodyLines.slice(0, maxBody).join('\n');
  const bodyHidden = Math.max(0, bodyLines.length - maxBody);

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={inputActive ? 'cyan' : 'gray'}
        paddingX={1}
        width={width}
      >
        <Text bold color={inputActive ? 'cyan' : 'gray'}>
          {'⌕ '}
        </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSearch}
          placeholder="Search the docs: Sales Invoice, DocType, valuation…"
          focus={inputActive}
        />
      </Box>

      {isLoading && (
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> Searching…</Text>
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color="red">✖ {error}</Text>
        </Box>
      )}

      {expanded && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text bold color="cyan" wrap="wrap">
            {expanded.breadcrumb}
          </Text>
          <Text dimColor>
            {[
              expanded.space,
              expanded.ui_path,
              `score ${expanded.rerankScore.toFixed(3)}`,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Markdown text={bodyText} />
            {bodyHidden > 0 && (
              <Text dimColor>
                … {bodyHidden} more {bodyHidden === 1 ? 'line' : 'lines'}
              </Text>
            )}
          </Box>
          {expanded.source_url && (
            <Box marginTop={1}>
              <Text dimColor>{truncate(expanded.source_url, width - 4)}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>enter or esc to go back</Text>
          </Box>
        </Box>
      )}

      {!expanded && results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box justifyContent="space-between" width={width} marginBottom={1}>
            <Text dimColor>
              {results.length} {results.length === 1 ? 'match' : 'matches'}
            </Text>
            <Text dimColor>
              {focusMode === 'list' ? '↑↓ select · enter read · / edit query' : '↓ to browse results'}
            </Text>
          </Box>

          {windowStart > 0 && <Text dimColor>  ↑ {windowStart} more</Text>}

          {visibleResults.map((r, i) => {
            const idx = windowStart + i;
            const isSelected = focusMode === 'list' && idx === selectedIndex;
            const meta = `${r.rerankScore.toFixed(2)} · ${r.space}`;
            const titleRoom = Math.max(10, width - meta.length - 8);

            return (
              <Box key={r.chunkId} flexDirection="column" marginBottom={1}>
                <Box justifyContent="space-between" width={width}>
                  <Text bold={isSelected} color={isSelected ? 'cyan' : undefined}>
                    {isSelected ? '› ' : '  '}
                    {idx + 1}. {truncate(r.breadcrumb, titleRoom)}
                  </Text>
                  <Text dimColor>{meta}</Text>
                </Box>
                <Text dimColor>
                  {'     '}
                  {truncate(r.content, width - 8)}
                </Text>
              </Box>
            );
          })}

          {windowStart + visibleCount < results.length && (
            <Text dimColor>  ↓ {results.length - windowStart - visibleCount} more</Text>
          )}
        </Box>
      )}

      {!isLoading && !error && hasSearched && results.length === 0 && (
        <Box marginTop={1}>
          <Text color="yellow">Nothing found for “{truncate(query, width - 24)}”. Try fewer or different words.</Text>
        </Box>
      )}

      {!hasSearched && !isLoading && !error && (
        <Box marginTop={1}>
          <Text dimColor>Type a topic and press enter. Results are ranked by relevance.</Text>
        </Box>
      )}
    </Box>
  );
}
