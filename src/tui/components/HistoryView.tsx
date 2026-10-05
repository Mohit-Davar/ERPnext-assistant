import { deleteConversation, listConversations } from '@/history/index.ts';
import type { ConversationSummary } from '@/history/types.ts';
import { Box, Text, useInput, useStdin } from 'ink';
import { useCallback, useEffect, useState } from 'react';

import { getDb } from './db.ts';
import { truncate, useTerminalSize } from './ui.tsx';

interface HistoryViewProps {
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
  width: number;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function formatWhen(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryView({
  onOpenConversation,
  onDeleteConversation,
  onNewConversation,
  width,
}: HistoryViewProps) {
  const { isRawModeSupported } = useStdin();
  const { rows } = useTerminalSize();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      const list = listConversations(getDb());
      setConversations(list);
      setSelectedIndex((i) => Math.min(i, Math.max(0, list.length - 1)));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useInput(
    (input, key) => {
      if (input === 'n') {
        onNewConversation();
        return;
      }
      if (conversations.length === 0) return;

      const selected = conversations[selectedIndex];

      // 'd' twice in a row deletes. Any other key cancels.
      if (input === 'd' && selected) {
        if (pendingDeleteId === selected.id) {
          try {
            deleteConversation(getDb(), selected.id);
            onDeleteConversation(selected.id);
            refresh();
          } catch (err) {
            setError(errorMessage(err));
          }
          setPendingDeleteId(null);
        } else {
          setPendingDeleteId(selected.id);
        }
        return;
      }
      setPendingDeleteId(null);

      if (key.upArrow) {
        setSelectedIndex((i) => (i > 0 ? i - 1 : conversations.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) => (i < conversations.length - 1 ? i + 1 : 0));
      } else if (key.return && selected) {
        onOpenConversation(selected.id);
      }
    },
    { isActive: isRawModeSupported },
  );

  const visibleCount = Math.max(3, rows - 12);
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleCount / 2), conversations.length - visibleCount),
  );
  const visible = conversations.slice(windowStart, windowStart + visibleCount);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Conversations</Text>
        <Text dimColor> {conversations.length}</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">✖ {error}</Text>
        </Box>
      )}

      {conversations.length === 0 && !error ? (
        <Box flexDirection="column">
          <Text>Nothing here yet.</Text>
          <Text dimColor>Your questions are saved automatically. Press n to start one.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {windowStart > 0 && <Text dimColor>  ↑ {windowStart} more</Text>}

          {visible.map((conv, i) => {
            const idx = windowStart + i;
            const isSelected = idx === selectedIndex;
            const isPending = pendingDeleteId === conv.id;
            const count = conv.messageCount ?? 0;
            const meta = isPending
              ? 'press d again to delete'
              : `${count} ${count === 1 ? 'msg' : 'msgs'} · ${formatWhen(conv.updatedAt)}`;
            const titleRoom = Math.max(10, width - meta.length - 6);

            return (
              <Box key={conv.id} justifyContent="space-between" width={width}>
                <Text bold={isSelected} color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? '› ' : '  '}
                  {truncate(conv.title, titleRoom)}
                </Text>
                <Text color={isPending ? 'red' : undefined} dimColor={!isPending}>
                  {meta}
                </Text>
              </Box>
            );
          })}

          {windowStart + visibleCount < conversations.length && (
            <Text dimColor>  ↓ {conversations.length - windowStart - visibleCount} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
