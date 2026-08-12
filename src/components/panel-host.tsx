import type { ReactNode } from 'react';
import { Drawer } from 'react-native-drawer-layout';

import { PANEL_WIDTH, usePanel } from '@/lib/panel-context';

/**
 * The app's one right-side drawer, mounted above the navigation stack so it
 * covers the header rather than sliding in beneath it.
 *
 * It is `react-native-drawer-layout`, NOT expo-router's `Drawer`. The panel is
 * not a route: no URL, no history entry, and "back" from it is meaningless.
 * The navigator buys the same gesture and animation — they share this library
 * underneath — while claiming a navigation relationship that does not exist.
 *
 * Position, not parenthood, is what changed here: this used to be mounted
 * INSIDE the instance screen, which left the nav bar drawn above the panel and
 * two headers naming the same instance. Covering the header requires being
 * above the Stack; being above the Stack is what makes the panel global; and
 * `panel-context` is what hands the scoping back.
 *
 * `swipeEnabled` is the whole policy: a screen that registers no content
 * cannot open this by gesture or otherwise, so an empty panel is not draggable
 * out of the Explorer.
 */
export function PanelHost({ children }: { children: ReactNode }) {
  const { open, setOpen, content } = usePanel();

  return (
    <Drawer
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      drawerPosition="right"
      drawerType="front"
      swipeEnabled={content !== null}
      drawerStyle={{ width: PANEL_WIDTH }}
      renderDrawerContent={() => content?.() ?? null}>
      {children}
    </Drawer>
  );
}
