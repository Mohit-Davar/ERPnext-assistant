import { Box, Text } from 'ink';

export type TabKey = 'ask' | 'search' | 'history';

interface TabsProps {
  activeTab: TabKey;
}

export const TAB_ORDER: TabKey[] = ['ask', 'search', 'history'];

export const TAB_LABELS: Record<TabKey, string> = {
  ask: 'Ask',
  search: 'Search',
  history: 'History',
};

export function Tabs({ activeTab }: TabsProps) {
  return (
    <Box>
      {TAB_ORDER.map((tab, idx) => {
        const isActive = tab === activeTab;
        return (
          <Box key={tab} marginLeft={idx === 0 ? 0 : 3}>
            <Text dimColor>{idx + 1} </Text>
            {isActive ? (
              <Text bold color="cyan" underline>
                {TAB_LABELS[tab]}
              </Text>
            ) : (
              <Text dimColor>{TAB_LABELS[tab]}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
