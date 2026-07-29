import type { ReactNode } from 'react';

import { Box } from './box';
import { Inline } from './stack';
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
 *
 * `trailing` holds a control that belongs to the section rather than to any
 * row in it — Settings' Re-sync, the instance filter. The label alone is the
 * common case and the call signature for it is unchanged.
 */
export function SectionHeader({ children, trailing }: { children: string; trailing?: ReactNode }) {
  return (
    <Box px="lg" py="sm" bg="bgSolidBase">
      <Inline justify="space-between">
        <Text variant="monoLabel" color="txTertiary">
          {children.toUpperCase()}
        </Text>
        {trailing ?? null}
      </Inline>
    </Box>
  );
}
