import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModuleList } from '@/components/module-list';
import { DAEMON_BASE_URL } from '@/lib/config';
import { DaemonClient } from '@/lib/daemon/client';
import type { Composition } from '@/lib/daemon/types';
import { useTheme } from '@/theme';

export default function Explorer() {
  const theme = useTheme();
  const [composition, setComposition] = useState<Composition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setComposition(await new DaemonClient().getComposition());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          {DAEMON_BASE_URL}
        </Text>
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txTertiary,
            paddingTop: theme.space.sm,
          }}>
          {error}
        </Text>
        <Pressable
          onPress={load}
          style={{
            marginTop: theme.space.lg,
            alignSelf: 'flex-start',
            paddingVertical: theme.space.sm,
            paddingHorizontal: theme.space.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.bgAccent,
          }}>
          <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Try again</Text>
        </Pressable>
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
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <ModuleList composition={composition} refreshing={refreshing} onRefresh={refresh} />
        {/* Capture is an action rather than a tab: snippets are fed in
            throughout the day, so it should be at hand from wherever you are,
            not somewhere you navigate to. */}
        <Link href="/capture" asChild>
          <Pressable
            style={{
              position: 'absolute',
              right: theme.space.lg,
              bottom: theme.space.xl,
              paddingVertical: theme.space.md,
              paddingHorizontal: theme.space.xl,
              borderRadius: theme.radius.full,
              backgroundColor: theme.color.bgAccent,
              borderWidth: theme.border.thin,
              borderColor: theme.color.bdAccent,
            }}>
            <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Capture</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
