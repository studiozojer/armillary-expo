import { Link } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModuleList } from '@/components/module-list';
import { useHost } from '@/lib/host-context';
import { DaemonClient } from '@/lib/daemon/client';
import type { Composition } from '@/lib/daemon/types';
import { useTheme } from '@/theme';

export default function Explorer() {
  const theme = useTheme();
  const { host, generation, ready } = useHost();
  const [composition, setComposition] = useState<Composition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setComposition(await new DaemonClient(host.daemonUrl).getComposition());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [host]);

  useEffect(() => {
    if (!ready) return;
    setComposition(null);
    void load();
  }, [load, ready, generation]);

  const refresh = useCallback(async () => {
    // The engine is fresh on every request but the app only fetches on mount,
    // so this is what makes "go check the board" work without navigating away.
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, padding: theme.space.lg }}>
        <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>
          Can&apos;t reach the engine
        </Text>
        {/* Named specifically, because the app is usually where a tailnet or a
            bind problem first becomes visible, and "something went wrong" would
            send you looking in the wrong place. */}
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txTertiary,
            paddingTop: theme.space.xs,
          }}>
          {host.daemonUrl}
        </Text>
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txTertiary,
            paddingTop: theme.space.sm,
          }}>
          {error}
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.lg }}>
          <Pressable
            onPress={load}
            style={{
              paddingVertical: theme.space.sm,
              paddingHorizontal: theme.space.lg,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.bgAccent,
            }}>
            <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Try again</Text>
          </Pressable>
          {/* The switcher belongs here above all: an unreachable host is exactly
              when you want to try another one, and needing a rebuild to do that
              is what made the first failure take as long as it did. */}
          <Link href="/settings" asChild>
            <Pressable
              style={{
                paddingVertical: theme.space.sm,
                paddingHorizontal: theme.space.lg,
                borderRadius: theme.radius.md,
                borderWidth: theme.border.thin,
                borderColor: theme.color.bdPrimary,
              }}>
              <Text style={{ ...theme.type.label, color: theme.color.txSecondary }}>
                Change host
              </Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  if (!composition) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <Stack.Screen
        options={{
          // In the header, not floating: an absolutely-positioned button in a
          // screen that owns no chrome ends up underneath the native tab bar,
          // and guessing the tab bar's height to dodge it is a magic number
          // waiting to be wrong on another device.
          headerRight: () => (
            <Link href="/capture" asChild>
              <Pressable hitSlop={8}>
                <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Capture</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <ModuleList
        composition={composition}
        hostLabel={host.label}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    </SafeAreaView>
  );
}
