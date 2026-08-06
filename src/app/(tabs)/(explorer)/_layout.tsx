import { Stack } from 'expo-router/stack';

/**
 * The Explorer tab's own stack.
 *
 * Screens pushed *from* Explorer — capture, composition, browse — live here,
 * because a `NativeTabs` trigger is not a navigator: a route outside a tab's
 * stack has nothing to push onto, so `Link` to it silently does nothing, with
 * no error and no navigation. That is what made the host switcher look dead on
 * device once.
 *
 * Settings is the exception and lives on the ROOT stack, one level above the
 * tab bar, because it is shared with the Instances tab. Inside this group only
 * Explorer could reach it.
 */
export default function ExplorerLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Armillary' }} />
      <Stack.Screen name="composition" options={{ title: 'Composition' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture', presentation: 'modal' }} />
      <Stack.Screen name="browse/[...path]" />
      <Stack.Screen name="repo/[name]" />
      <Stack.Screen name="spike-markdown" options={{ title: 'Markdown spike' }} />
    </Stack>
  );
}
