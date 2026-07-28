import { Box } from './box';
import { Text } from './text';

/**
 * A list section's label: mono, uppercase, letterspaced.
 *
 * The instrument register carries labels even on reading surfaces — it is what
 * distinguishes structure from content at a glance.
 */
export function SectionHeader({ children }: { children: string }) {
  return (
    <Box px="lg" py="sm">
      <Text variant="monoLabel" color="txTertiary">
        {children.toUpperCase()}
      </Text>
    </Box>
  );
}
