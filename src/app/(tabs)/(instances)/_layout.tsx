import { Stack } from 'expo-router/stack';

export default function InstancesLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Instances' }} />
      {/* Required — a route not registered here has nothing to push onto:
          `NativeTabs.Trigger` is not a navigator, so `Link` to an
          unregistered screen silently no-ops (the sprint-1 defect documented
          in (explorer)/_layout.tsx). */}
      <Stack.Screen name="[instanceId]" options={{ title: 'Session' }} />
      {/* The `+` sheet. `formSheet`, not `modal`: react-native-screens 4.26 /
          this SDK's native-stack supports it cleanly, and a picker-plus-button
          reads as a sheet, not a full-screen takeover like Capture's `modal`.
          Registered here for the same reason `[instanceId]` is — an
          unregistered route has nothing to push onto. */}
      <Stack.Screen name="new" options={{ title: 'New instance', presentation: 'formSheet' }} />
    </Stack>
  );
}
