import { Box } from './box';
import { Text } from './text';

/**
 * A list section's label: mono, uppercase, letterspaced.
 *
 * The instrument register carries labels even on reading surfaces — it is what
 * distinguishes structure from content at a glance.
 *
 * Opaque, on the page surface rather than on nothing. `SectionList` sticks its
 * headers by default on iOS, and rows are `bg/solid/card` now rather than
 * transparent — so a header that paints no background has OPERATORS and the
 * rows scrolling under it drawn on top of each other. The page surface is also
 * what "the list is a block that terminates" implies: the header belongs to the
 * page, the rows are the block sitting on it.
 */
export function SectionHeader({ children }: { children: string }) {
  return (
    <Box px="lg" py="sm" bg="bgSolidBase">
      <Text variant="monoLabel" color="txTertiary">
        {children.toUpperCase()}
      </Text>
    </Box>
  );
}
