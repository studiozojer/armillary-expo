import { Stack } from 'expo-router/stack';

export default function InstancesLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Instances' }} />
    </Stack>
  );
}
