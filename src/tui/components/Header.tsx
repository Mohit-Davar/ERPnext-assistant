import { Box, Text } from 'ink';

interface HeaderProps {
  subtitle?: string;
}

export function Header({ subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyanBright">
          ◈ ERPNext Assistant
        </Text>
      </Box>
      {subtitle && (
        <Text color="gray" dimColor>
          {subtitle}
        </Text>
      )}
      <Box>
        <Text color="gray" dimColor>
          {'─'.repeat(50)}
        </Text>
      </Box>
    </Box>
  );
}
