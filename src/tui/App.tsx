import { Box, useApp, useInput } from 'ink';
import React, { useState } from 'react';

import { AskView } from './components/AskView.tsx';
import { Header } from './components/Header.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { IngestView } from './components/IngestView.tsx';
import { SearchView } from './components/SearchView.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { TAB_ORDER, Tabs, type TabKey } from './components/Tabs.tsx';

export function App() {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('ask');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(true);

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Exit on Ctrl+C
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Tab switching with arrow keys when not focused in a text input
    if (!isInputFocused) {
      if (key.leftArrow) {
        const curIdx = TAB_ORDER.indexOf(activeTab);
        const nextIdx = curIdx > 0 ? curIdx - 1 : TAB_ORDER.length - 1;
        setActiveTab(TAB_ORDER[nextIdx]!);
        return;
      }
      if (key.rightArrow) {
        const curIdx = TAB_ORDER.indexOf(activeTab);
        const nextIdx = curIdx < TAB_ORDER.length - 1 ? curIdx + 1 : 0;
        setActiveTab(TAB_ORDER[nextIdx]!);
        return;
      }
      if (key.return || input === '/' || input === 'i') {
        setIsInputFocused(true);
        return;
      }
    }

    // Direct tab hotkeys 1-4 when not typing
    if (!isInputFocused) {
      if (input === '1') { setActiveTab('ask'); return; }
      if (input === '2') { setActiveTab('search'); return; }
      if (input === '3') { setActiveTab('ingest'); return; }
      if (input === '4') { setActiveTab('history'); return; }
    }
  });

  const handleOpenConversation = (id: string) => {
    setActiveConversationId(id);
    setActiveTab('ask');
    setIsInputFocused(true);
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setActiveTab('ask');
    setIsInputFocused(true);
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Header />

      {/* Navigation Tabs */}
      <Tabs activeTab={activeTab} />

      {/* Main Content Area */}
      <Box flexDirection="column" minHeight={12}>
        {activeTab === 'ask' && (
          <AskView
            conversationId={activeConversationId}
            onConversationChange={setActiveConversationId}
            isFocused={isInputFocused}
            onUnfocus={() => setIsInputFocused(false)}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            isFocused={isInputFocused}
            onUnfocus={() => setIsInputFocused(false)}
          />
        )}

        {activeTab === 'ingest' && (
          <IngestView
            isFocused={isInputFocused}
            onUnfocus={() => setIsInputFocused(false)}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            isFocused={isInputFocused}
            onOpenConversation={handleOpenConversation}
            onNewConversation={handleNewConversation}
            onUnfocus={() => setIsInputFocused(false)}
          />
        )}
      </Box>

      {/* Bottom Status Bar */}
      <StatusBar activeTab={activeTab} />
    </Box>
  );
}
