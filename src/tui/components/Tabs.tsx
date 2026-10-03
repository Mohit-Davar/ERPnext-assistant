import { Box, Text } from 'ink';
import React from 'react';

export type TabKey = 'ask' | 'search' | 'ingest' | 'history';

interface TabsProps {
  activeTab: TabKey;
  onSelectTab?: (tab: TabKey) => void;
}

export const TAB_ORDER: TabKey[] = ['ask', 'search', 'ingest', 'history'];

export const TAB_LABELS: Record<TabKey, string> = {
  ask: 'Ask',
  search: 'Search',
  ingest: 'Ingest',
  history: 'History',
};

export function Tabs({ activeTab }: TabsProps) {
  return (
    <Box flexDirection="row" marginBottom={1}>
      {TAB_ORDER.map((tab, idx) => {
        const isActive = tab === activeTab;
        return (
          <Box key={tab} marginRight={2}>
            {isActive ? (
              <Text bold color="black" backgroundColor="cyan">
                {` [ ${TAB_LABELS[tab]} ] `}
              </Text>
            ) : (
              <Text color="gray">
                {`   ${TAB_LABELS[tab]}   `}
              </Text>
            )}
            {idx < TAB_ORDER.length - 1 && <Text color="gray" dimColor>│</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
