import { Stack } from 'expo-router/stack';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InstanceCard } from '@/components/instance-card';
import { SettingsButton } from '@/components/settings-button';
import type { Instance } from '@/lib/session/events';
import { sessionAPI } from '@/lib/session/instance';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

export default function Instances() {
  const theme = useTheme();

  const load = useCallback(async () => sessionAPI.list(), []);
  const { state, refreshing, refresh } = useLoader<Instance[]>('instances', load);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      {/* Settings is reachable from both tabs, because it holds the host
          switcher — and which machine is serving is as load-bearing here as it
          is in Explorer. */}
      <Stack.Screen options={{ headerLeft: () => <SettingsButton /> }} />

      {/* The banner is the point. A stub that looks live is a lie the screen
          tells every time it is opened, and this one will sit here for at least
          a sprint. */}
      <View
        style={{
          margin: theme.space.lg,
          padding: theme.space.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.bgWarning,
          borderWidth: theme.border.thin,
          borderColor: theme.color.bdSecondary,
        }}>
        <Text style={{ ...theme.type.label, color: theme.color.txWarning }}>Mock session data</Text>
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txSecondary,
            paddingTop: theme.space.xxs,
          }}>
          The live engine arrives with sprint 2 phase C.
        </Text>
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator style={{ marginTop: theme.space.xl }} />
      ) : (
        <FlatList
          data={state.status === 'ok' ? state.data : []}
          keyExtractor={(instance) => instance.id}
          contentContainerStyle={{ paddingHorizontal: theme.space.lg }}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => <InstanceCard instance={item} />}
        />
      )}
    </SafeAreaView>
  );
}
