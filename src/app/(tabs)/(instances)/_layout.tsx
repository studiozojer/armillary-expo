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
    </Stack>
  );
}
