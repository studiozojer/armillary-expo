import type { ReactNode } from 'react';

import { Box } from './box';
import { CircleButton } from './circle-button';
import { Inline, Stack } from './stack';
import { Text } from './text';

/**
 * The header a right-side PANEL wears — the app's half of daoUI's
 * `PanelHeader` (published 2026-08-11), the fourth member of the header family
 * after `Page Header / Named`, `Page Header / Identity` and `Sheet Header`.
 *
 * Four deliberate differences from its siblings, carried here from the
 * component's own description so they survive in the place they constrain:
 *
 * 1. **No back affordance.** A panel is presented over where you are, not
 *    navigated to, so there is nothing behind it to return to.
 * 2. **The dismiss is drawn and cannot be hidden** — hence `onDismiss` being
 *    required rather than optional. A sheet gets the platform grabber when
 *    `sheetGrabberVisible`; a drawer gets nothing, so the only way out is the
 *    one this component draws. A panel you cannot close is not a state worth
 *    making expressible, so the type does not permit it.
 * 3. **Left-aligned, not centred.** Centring balances a back button against an
 *    action; with no back button it is arbitrary, and left agrees with the rows
 *    beneath.
 * 4. **It names the thing, not the viewer** — a title and subtitle, while
 *    keeping `Page Header / Identity`'s left-aligned leading mark.
 *
 * `action` sits *before* the dismiss and is optional (David, 2026-08-11).
 */
export function PanelHeader({
  leading,
  title,
  subtitle,
  action,
  onDismiss,
  dismissLabel = 'Close panel',
  testID,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  /** An optional control before the dismiss. The dismiss is not optional. */
  action?: ReactNode;
  onDismiss: () => void;
  dismissLabel?: string;
  testID?: string;
}) {
  return (
    <Box px="xl" py="xl" testID={testID}>
      <Inline gap="lg">
        {leading ?? null}

        <Stack flex={1}>
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="whyteXs" color="txTertiary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </Stack>

        <Inline gap="sm">
          {action ?? null}
          <CircleButton icon="close" accessibilityLabel={dismissLabel} onPress={onDismiss} />
        </Inline>
      </Inline>
    </Box>
  );
}
