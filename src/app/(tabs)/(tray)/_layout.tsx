import { Stack } from 'expo-router/stack';

/**
 * The Tray tab's own stack. Only the feed lives here: opening an arrival
 * pushes `/browse/...`, which is Explorer's screen, and the router switches
 * tabs to reach it — the same path a push tap takes.
 */
export default function TrayLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Tray' }} />
    </Stack>
  );
}
