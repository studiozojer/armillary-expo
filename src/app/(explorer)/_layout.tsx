import { Stack } from 'expo-router/stack';

/**
 * The Explorer tab's own stack.
 *
 * Every screen reachable from Explorer — settings, capture, browse — lives in
 * this group, because a `NativeTabs` trigger is not a navigator. A route sitting
 * outside a tab's stack has nothing to push onto, so `Link` to it silently does
 * nothing: no error, no navigation. That is what made the host switcher look
 * dead on device.
 */
export default function ExplorerLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Armillary' }} />
      <Stack.Screen name="settings" options={{ title: 'Host', presentation: 'modal' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture', presentation: 'modal' }} />
      <Stack.Screen name="browse/[...path]" />
      <Stack.Screen name="spike-markdown" options={{ title: 'Markdown spike' }} />
    </Stack>
  );
}
