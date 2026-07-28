import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InstanceCard } from '@/components/instance-card';
import { SettingsButton } from '@/components/settings-button';
import { Box, Callout } from '@/components/ui';
import type { Instance } from '@/lib/session/events';
import { MockSessionAPI } from '@/lib/session/mock';
import { useTheme } from '@/theme';

const api = new MockSessionAPI();

export default function Instances() {
  const theme = useTheme();
  const [instances, setInstances] = useState<Instance[]>([]);

  useEffect(() => {
    void api.list().then(setInstances);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bgSolidBase }} edges={[]}>
      {/* Settings is reachable from both tabs, because it holds the host
          switcher — and which machine is serving is as load-bearing here as it
          is in Explorer. */}
      <Stack.Screen options={{ headerLeft: () => <SettingsButton /> }} />


      {/* The banner is the point. A stub that looks live is a lie the screen
          tells every time it is opened, and this one will sit here for at least
          a sprint. */}
      <Box p="lg">
        <Callout title="Not live yet">
          Fixture data behind the SessionAPI seam. The engine has no loop in sprint 1.
        </Callout>
      </Box>

      <FlatList
        data={instances}
        keyExtractor={(instance) => instance.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.lg, gap: theme.space.sm }}
        renderItem={({ item }) => <InstanceCard instance={item} />}
      />
    </SafeAreaView>
  );
}
