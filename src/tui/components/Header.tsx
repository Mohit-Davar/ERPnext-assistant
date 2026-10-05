import { Box, Text } from 'ink';

import { Tabs, type TabKey } from './Tabs.tsx';
import { Rule } from './ui.tsx';

interface HeaderProps {
  activeTab: TabKey;
  width: number;
}

export function Header({ activeTab, width }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between" width={width}>
        <Box>
          <Text bold color="cyan">
            ◈{' '}
          </Text>
          <Text bold>ERPNext</Text>
          {width >= 72 && <Text dimColor> docs assistant</Text>}
        </Box>
        <Tabs activeTab={activeTab} />
      </Box>
      <Rule width={width} />
    </Box>
  );
}
