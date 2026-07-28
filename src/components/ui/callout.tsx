import { Box } from './box';
import { Stack } from './stack';
import { Text } from './text';

/**
 * A standing notice. Designed, but never softened.
 *
 * The Instances stub says it is a stub because a screen that looks live is a
 * lie it tells every time it opens. Making that banner a designed object is the
 * point; making it quieter is not.
 */
export function Callout({ title, children }: { title: string; children: string }) {
  return (
    <Box p="md" radius="md" bg="bgWarning" border="thin" borderColor="bdSecondary">
      <Stack gap="xxs">
        <Text variant="label" color="txWarning">
          {title}
        </Text>
        <Text variant="caption" color="txSecondary">
          {children}
        </Text>
      </Stack>
    </Box>
  );
}
