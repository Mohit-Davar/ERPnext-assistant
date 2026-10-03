import { Box, Text } from 'ink';
import React from 'react';

interface HeaderProps {
  subtitle?: string;
  activeTab?: string;
}

export function Header({ subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="cyan">
            ◈ ERPNext Assistant
          </Text>
          <Text color="gray"> │ Documentation RAG & Search</Text>
        </Box>
        {subtitle && (
          <Box>
            <Text color="gray" dimColor>
              {subtitle}
            </Text>
          </Box>
        )}
      </Box>
      <Box>
        <Text color="gray" dimColor>
          {'─'.repeat(70)}
        </Text>
      </Box>
    </Box>
  );
}
