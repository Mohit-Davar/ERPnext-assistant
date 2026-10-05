import { Box, Text } from 'ink';

import type { TabKey } from './Tabs.tsx';
import { Rule } from './ui.tsx';

type Hint = [key: string, action: string];

interface StatusBarProps {
  activeTab: TabKey;
  isFocused: boolean;
  width: number;
  hints?: Hint[];
}

function hintsFor(tab: TabKey, isFocused: boolean): Hint[] {
  if (tab === 'history') {
    return [
      ['↑↓', 'select'],
      ['enter', 'open'],
      ['d', 'delete'],
      ['n', 'new chat'],
      ['tab', 'next'],
      ['^c', 'quit'],
    ];
  }
  if (!isFocused) {
    return [
      ['enter', 'start typing'],
      ['←→', 'switch tab'],
      ['1-3', 'jump'],
      ['^c', 'quit'],
    ];
  }
  if (tab === 'ask') {
    return [
      ['enter', 'send'],
      ['^n', 'new chat'],
      ['tab', 'next'],
      ['esc', 'navigate'],
      ['^c', 'quit'],
    ];
  }
  return [
    ['enter', 'search / open'],
    ['↑↓', 'select'],
    ['esc', 'back'],
    ['tab', 'next'],
    ['^c', 'quit'],
  ];
}

export function StatusBar({ activeTab, isFocused, width, hints }: StatusBarProps) {
  const items = hints ?? hintsFor(activeTab, isFocused);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Rule width={width} />
      <Box>
        {items.map(([key, action], idx) => (
          <Box key={key} marginRight={idx === items.length - 1 ? 0 : 2}>
            <Text bold>{key}</Text>
            <Text dimColor> {action}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
