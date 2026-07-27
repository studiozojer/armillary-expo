import { NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * Two tabs, each a route group with its own Stack.
 *
 * The trigger names must be the group directories — a trigger is not a
 * navigator, it selects one. Screens pushed from a tab live inside that tab's
 * group, which is what makes `Link` work at all.
 *
 * Capture is not a tab: it is a modal reached from Explorer, because snippets
 * are fed in throughout the day and belong at hand rather than as a destination.
 * SF Symbols instead of bundled PNGs — they adapt to weight, tint and platform
 * without shipping three raster sizes each.
 */
export default function AppTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="(explorer)">
        <NativeTabs.Trigger.Icon sf="folder" md="folder" />
        <NativeTabs.Trigger.Label>Explorer</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(instances)">
        <NativeTabs.Trigger.Icon sf="square.stack.3d.up" md="layers" />
        <NativeTabs.Trigger.Label>Instances</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
