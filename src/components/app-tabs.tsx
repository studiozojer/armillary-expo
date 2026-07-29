import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { families } from '@/theme/fonts.gen';
import { useTheme } from '@/theme';

/**
 * Two tabs, each a route group with its own Stack.
 *
 * The trigger names must be the group directories — a trigger is not a
 * navigator, it selects one. Screens pushed from a tab live inside that tab's
 * group, which is what makes `Link` work at all.
 *
 * Capture is not a tab: it is a modal reached from Explorer, because snippets
 * are fed in throughout the day and belong at hand rather than as a destination.
 *
 * The bar's SHAPE is iOS 26's — the floating capsule, its inset, and the
 * highlight behind the selected tab are the platform's, not ours. Only colour,
 * type and icons are set here. `fontSize` is deliberately not set: tab-bar
 * metrics belong to the platform and overriding them fights the capsule.
 */
export default function AppTabs() {
  const theme = useTheme();
  const label = { fontFamily: families.whyte.book };

  return (
    <NativeTabs
      backgroundColor={theme.color.bgSolidCard}
      iconColor={{ default: theme.color.icSecondary, selected: theme.color.icPrimary }}
      labelStyle={{
        default: { ...label, color: theme.color.txTertiary },
        selected: { ...label, color: theme.color.txPrimary },
      }}>
      <NativeTabs.Trigger name="(instances)">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'light.min', selected: 'light.max' }}
          md={{ default: 'light_mode', selected: 'light_mode' }}
        />
        <NativeTabs.Trigger.Label>Instances</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(explorer)">
        <NativeTabs.Trigger.Icon sf="globe.desk.fill" md="public" />
        <NativeTabs.Trigger.Label>Explorer</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
