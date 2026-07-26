import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { themeFor } from '@/theme';

/**
 * Two tabs, not three.
 *
 * Explorer (files) and Instances (sessions) are the app's two real halves.
 * Capture is an action reached from Explorer rather than a destination: snippets
 * are fed in throughout the day, so it belongs at hand rather than somewhere you
 * navigate to. The scaffold also ships only two tab icons, and inventing a third
 * was not worth doing before the visual pass.
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const theme = themeFor(scheme === 'dark' ? 'dark' : 'light');

  return (
    <NativeTabs
      backgroundColor={theme.color.bgSecondary}
      indicatorColor={theme.color.bgAccent}
      labelStyle={{ selected: { color: theme.color.txPrimary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Explorer</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="instances">
        <NativeTabs.Trigger.Label>Instances</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
