import { Box, Text } from 'ink';
import React from 'react';

import type { TabKey } from './Tabs.tsx';

interface StatusBarProps {
  activeTab: TabKey;
  customHint?: string;
}

export function StatusBar({ activeTab, customHint }: StatusBarProps) {
  const hints: Record<TabKey, string> = {
    ask: '[Enter] Send  [Esc] Switch Tab  [n] New Chat  [Ctrl+C] Exit',
    search: '[Enter] Search/Expand  [↑/↓] Navigate  [Esc] Back  [Ctrl+C] Exit',
    ingest: '[Enter] Run Ingestion  [v] Toggle Verbose  [Ctrl+C] Exit',
    history: '[Enter] Open  [d] Delete  [n] New  [↑/↓] Navigate  [Ctrl+C] Exit',
  };

  const currentHint = customHint || hints[activeTab];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="gray" dimColor>
          {'─'.repeat(70)}
        </Text>
      </Box>
      <Box justifyContent="space-between">
        <Box>
          <Text color="gray">
            <Text color="cyan">Tab Nav:</Text> ←/→  │  <Text color="gray">{currentHint}</Text>
          </Text>
        </Box>
        <Box>
          <Text color="gray" dimColor>
            Tab: <Text bold color="cyan">{activeTab.toUpperCase()}</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
