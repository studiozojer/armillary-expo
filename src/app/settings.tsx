import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { useHost } from '@/lib/host-context';
import { probe, type Host, type Reachability } from '@/lib/hosts';
import { useShowDotfiles } from '@/lib/preferences';
import { useTheme } from '@/theme';

export default function Settings() {
  const theme = useTheme();
  const { host, hosts, setHost } = useHost();
  const { showDotfiles, setShowDotfiles } = useShowDotfiles();
  const [results, setResults] = useState<Record<string, Reachability>>({});

  const probeAll = useCallback(async () => {
    setResults(Object.fromEntries(hosts.map((h) => [h.id, { state: 'checking' } as Reachability])));
    // Probed in parallel and reported per host: the useful question is not
    // "is the app broken" but "which of these is actually serving".
    const pairs = await Promise.all(hosts.map(async (h) => [h.id, await probe(h)] as const));
    setResults(Object.fromEntries(pairs));
  }, [hosts]);

  useEffect(() => {
    void probeAll();
  }, [probeAll]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScrollView contentContainerStyle={{ padding: theme.space.lg }}>
        <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>Files</Text>
        <Pressable
          onPress={() => setShowDotfiles(!showDotfiles)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: theme.space.md,
            marginBottom: theme.space.lg,
          }}>
          <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>Show dotfiles</Text>
          <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>
            {showDotfiles ? 'On' : 'Off'}
          </Text>
        </Pressable>

        <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
          Which machine is serving this workspace. Changing it takes effect immediately — no
          rebuild.
        </Text>

        <View style={{ height: theme.space.lg }} />

        {hosts.map((candidate) => (
          <HostRow
            key={candidate.id}
            host={candidate}
            selected={candidate.id === host.id}
            result={results[candidate.id] ?? { state: 'unknown' }}
            onSelect={() => setHost(candidate)}
          />
        ))}

        <Pressable
          onPress={probeAll}
          style={{
            marginTop: theme.space.lg,
            alignSelf: 'flex-start',
            paddingVertical: theme.space.sm,
            paddingHorizontal: theme.space.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.bgSecondary,
          }}>
          <Text style={{ ...theme.type.label, color: theme.color.txSecondary }}>Re-check all</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function HostRow({
  host,
  selected,
  result,
  onSelect,
}: {
  host: Host;
  selected: boolean;
  result: Reachability;
  onSelect: () => void;
}) {
  const theme = useTheme();

  const status =
    result.state === 'up'
      ? { text: result.root, color: theme.color.txSuccess }
      : result.state === 'down'
        ? { text: result.reason, color: theme.color.txError }
        : result.state === 'checking'
          ? { text: 'checking…', color: theme.color.txTertiary }
          : { text: '—', color: theme.color.txTertiary };

  return (
    <Pressable
      onPress={onSelect}
      style={{
        paddingVertical: theme.space.md,
        paddingHorizontal: theme.space.md,
        marginBottom: theme.space.sm,
        borderRadius: theme.radius.md,
        borderWidth: selected ? theme.border.medium : theme.border.hairline,
        borderColor: selected ? theme.color.bdAccent : theme.color.bdPrimary,
        backgroundColor: selected ? theme.color.bgAccent : 'transparent',
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <Text
          style={{
            ...theme.type.heading,
            color: selected ? theme.color.txAccent : theme.color.txPrimary,
          }}>
          {host.label}
        </Text>
        {selected ? (
          <Text style={{ ...theme.type.caption, color: theme.color.txAccent }}>· current</Text>
        ) : null}
      </View>

      <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>{host.daemonUrl}</Text>

      {/* The workspace root, not a green dot — two machines both serving is the
          case this screen exists for, and only the root tells them apart. */}
      <Text style={{ ...theme.type.caption, color: status.color, paddingTop: theme.space.xxs }}>
        {status.text}
      </Text>
    </Pressable>
  );
}
