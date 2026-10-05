import { Box, Text, useApp, useInput, useStdin } from 'ink';
import { useEffect, useState } from 'react';

import { AskView } from './components/AskView.tsx';
import { Header } from './components/Header.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { SearchView } from './components/SearchView.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { TAB_ORDER, type TabKey } from './components/Tabs.tsx';
import { MAX_WIDTH, useTerminalSize } from './components/ui.tsx';

export function App() {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { columns } = useTerminalSize();
  const width = Math.max(44, Math.min(columns, MAX_WIDTH) - 4);

  const [activeTab, setActiveTab] = useState<TabKey>('ask');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(true);

  // Interactive input needs a real terminal. Say so instead of crashing.
  useEffect(() => {
    if (!isRawModeSupported) exit();
  }, [isRawModeSupported, exit]);

  const cycleTab = (direction: 1 | -1) => {
    setActiveTab((current) => {
      const next = (TAB_ORDER.indexOf(current) + direction + TAB_ORDER.length) % TAB_ORDER.length;
      return TAB_ORDER[next]!;
    });
  };

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      // Tab / Shift+Tab always switches tabs, even while typing.
      if (key.tab) {
        cycleTab(key.shift ? -1 : 1);
        setIsInputFocused(true);
        return;
      }

      // Arrow keys and number hotkeys work whenever the user isn't typing.
      // History has no text field, so it is always in this mode.
      const navigating = !isInputFocused || activeTab === 'history';
      if (!navigating) return;

      if (key.leftArrow) return cycleTab(-1);
      if (key.rightArrow) return cycleTab(1);
      if (input === '1') return setActiveTab('ask');
      if (input === '2') return setActiveTab('search');
      if (input === '3') return setActiveTab('history');

      if (!isInputFocused && (key.return || input === '/' || input === 'i')) {
        setIsInputFocused(true);
      }
    },
    { isActive: isRawModeSupported },
  );

  const openConversation = (id: string) => {
    setActiveConversationId(id);
    setActiveTab('ask');
    setIsInputFocused(true);
  };

  const newConversation = () => {
    setActiveConversationId(null);
    setActiveTab('ask');
    setIsInputFocused(true);
  };

  if (!isRawModeSupported) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="yellow">
          This needs an interactive terminal. Run it directly in your shell, not through a pipe.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1} width={width + 4}>
      <Header activeTab={activeTab} width={width} />

      <Box flexDirection="column">
        {activeTab === 'ask' && (
          <AskView
            conversationId={activeConversationId}
            onConversationChange={(id) => setActiveConversationId(id || null)}
            isFocused={isInputFocused}
            onUnfocus={() => setIsInputFocused(false)}
            width={width}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            isFocused={isInputFocused}
            onUnfocus={() => setIsInputFocused(false)}
            width={width}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            onOpenConversation={openConversation}
            onDeleteConversation={(id) => {
              if (activeConversationId === id) setActiveConversationId(null);
            }}
            onNewConversation={newConversation}
            width={width}
          />
        )}
      </Box>

      <StatusBar activeTab={activeTab} isFocused={isInputFocused} width={width} />
    </Box>
  );
}
