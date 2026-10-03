import { deleteConversation, listConversations } from '@/history/index.ts';
import type { ConversationSummary } from '@/history/types.ts';
import { openDatabase } from '@/index/database.ts';
import { loadConfig } from '@/shared/config.ts';
import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';

interface HistoryViewProps {
  isFocused: boolean;
  onOpenConversation: (id: string) => void;
  onNewConversation: () => void;
  onUnfocus: () => void;
}

export function HistoryView({
  isFocused,
  onOpenConversation,
  onNewConversation,
  onUnfocus,
}: HistoryViewProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const config = loadConfig();
  const db = openDatabase(config.dbPath);

  const refresh = () => {
    const list = listConversations(db);
    setConversations(list);
    if (selectedIndex >= list.length && list.length > 0) {
      setSelectedIndex(list.length - 1);
    }
  };

  useEffect(() => {
    refresh();
  }, [isFocused]);

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.escape) {
      onUnfocus();
      return;
    }

    if (input === 'n') {
      onNewConversation();
      return;
    }

    if (conversations.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : conversations.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < conversations.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      const selected = conversations[selectedIndex];
      if (selected) {
        onOpenConversation(selected.id);
      }
      return;
    }

    if (input === 'd') {
      const selected = conversations[selectedIndex];
      if (selected) {
        deleteConversation(db, selected.id);
        refresh();
      }
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">
          Conversation History ({conversations.length})
        </Text>
        <Text color="gray" dimColor>
          [↑/↓] Select  [Enter] Open  [d] Delete  [n] New
        </Text>
      </Box>

      {conversations.length === 0 ? (
        <Box flexDirection="column" marginY={2} paddingLeft={2}>
          <Text color="gray">No saved conversations yet.</Text>
          <Text color="gray" dimColor>
            Switch to the Ask tab or press [n] to start a new chat.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {conversations.map((conv, idx) => {
            const isSelected = isFocused && idx === selectedIndex;
            const updatedDate = new Date(conv.updatedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <Box
                key={conv.id}
                flexDirection="row"
                justifyContent="space-between"
                paddingX={1}
                borderStyle={isSelected ? 'single' : undefined}
                borderColor={isSelected ? 'cyan' : undefined}
                marginBottom={1}
              >
                <Box>
                  <Text bold color={isSelected ? 'cyan' : 'white'}>
                    {isSelected ? '▶ ' : '  '}
                    {conv.title}
                  </Text>
                </Box>
                <Box>
                  <Text color="gray">
                    {conv.messageCount ?? 0} msgs │ {updatedDate}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
