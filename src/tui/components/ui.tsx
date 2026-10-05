import { Box, Text, useStdout } from 'ink';
import React, { useEffect, useState } from 'react';

export const MAX_WIDTH = 100;

/** Usable content width for a given terminal width. */
export function contentWidth(columns: number): number {
  return Math.max(40, Math.min(columns, MAX_WIDTH) - 4);
}

/** Terminal size that updates when the window is resized. */
export function useTerminalSize() {
  const { stdout } = useStdout();
  const read = () => ({ columns: stdout?.columns ?? 80, rows: stdout?.rows ?? 24 });
  const [size, setSize] = useState(read);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setSize(read());
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}

export function Rule({ width }: { width: number }) {
  return <Text dimColor>{'─'.repeat(Math.max(1, width))}</Text>;
}

/** Collapse whitespace and cut to `max` characters with an ellipsis. */
export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (max <= 1) return '';
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat;
}

/** Rough number of terminal rows a block of text takes once wrapped. */
export function wrappedLineCount(text: string, width: number): number {
  const w = Math.max(10, width);
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / w)), 0);
}

/** Keep only the last `maxLines` wrapped rows of a text. */
export function tailText(
  text: string,
  width: number,
  maxLines: number,
): { text: string; hidden: number } {
  const w = Math.max(10, width);
  const rows: string[] = [];
  for (const line of text.split('\n')) {
    if (line.length === 0) {
      rows.push('');
      continue;
    }
    for (let i = 0; i < line.length; i += w) rows.push(line.slice(i, i + w));
  }
  if (rows.length <= maxLines) return { text, hidden: 0 };
  return { text: rows.slice(rows.length - maxLines).join('\n'), hidden: rows.length - maxLines };
}

function inline(source: string): React.ReactNode[] {
  return source
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g)
    .filter(Boolean)
    .map((part, i) => {
      if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={i} bold>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
        return (
          <Text key={i} color="cyan">
            {part.slice(1, -1)}
          </Text>
        );
      }
      if (/^\[\d+\]$/.test(part)) {
        return (
          <Text key={i} color="cyan" dimColor>
            {part}
          </Text>
        );
      }
      return <Text key={i}>{part}</Text>;
    });
}

/** Tiny markdown renderer: headings, bullets, code fences, **bold**, `code`, [1] citations. */
export function Markdown({ text }: { text: string }) {
  let inCode = false;
  return (
    <Box flexDirection="column">
      {text.split('\n').map((line, i) => {
        if (line.trim().startsWith('```')) {
          inCode = !inCode;
          return null;
        }
        if (inCode) {
          return (
            <Text key={i} dimColor>
              {'  ' + line}
            </Text>
          );
        }
        if (!line.trim()) return <Text key={i}> </Text>;

        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} bold>
              {inline(heading[1] ?? '')}
            </Text>
          );
        }

        const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <Text key={i} wrap="wrap">
              {bullet[1]}
              <Text dimColor>• </Text>
              {inline(bullet[2] ?? '')}
            </Text>
          );
        }

        return (
          <Text key={i} wrap="wrap">
            {inline(line)}
          </Text>
        );
      })}
    </Box>
  );
}
