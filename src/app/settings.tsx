import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { DeviceEnrollment } from '@/components/device-enrollment';
import { Box, Button, Icon, Inline, Screen, SectionHeader, Stack as UIStack, Text } from '@/components/ui';
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
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space.xxxl }}>
        <SectionHeader
          trailing={<Button label="Re-sync" variant="secondary" onPress={() => void probeAll()} />}>
          Workspace
        </SectionHeader>

        <Box px="lg">
          <UIStack gap="sm">
            {hosts.map((candidate) => (
              <HostCard
                key={candidate.id}
                testID={`host-${candidate.id}`}
                host={candidate}
                selected={candidate.id === host.id}
                result={results[candidate.id] ?? { state: 'unknown' }}
                onSelect={() => setHost(candidate)}
              />
            ))}
          </UIStack>
        </Box>

        {/* Directly under the host list, because the credential belongs to
            the host selected above — switching hosts changes which token is
            in play, and separating the two would let someone enroll against a
            machine they are not looking at. */}
        <Box style={{ paddingTop: theme.space.lg }}>
          <SectionHeader>This device</SectionHeader>
        </Box>
        <DeviceEnrollment host={host} />

        <Box style={{ paddingTop: theme.space.lg }}>
          <SectionHeader>Files</SectionHeader>
        </Box>
        <Pressable
          onPress={() => setShowDotfiles(!showDotfiles)}
          accessibilityRole="button"
          accessibilityLabel={`Show dotfiles, ${showDotfiles ? 'on' : 'off'}`}>
          <Box px="lg" py="md">
            <Inline justify="space-between">
              <Text>Show dotfiles</Text>
              <Text variant="label" color="txAccent">
                {showDotfiles ? 'On' : 'Off'}
              </Text>
            </Inline>
          </Box>
        </Pressable>

        <Box style={{ paddingTop: theme.space.lg }}>
          <SectionHeader>Api keys</SectionHeader>
        </Box>
        {/* The key lives engine-side (~/.config/armillary/anthropic-key); there is
            nothing real to reveal or edit here. The row goes live when the
            key-management seam exists (design 2026-07-28, § Section 4 — David's
            ratified call, requirements deliberately unknown until the instance-loop
            work). */}
        <View
          testID="api-key-stub"
          accessible
          accessibilityState={{ disabled: true }}
          accessibilityLabel="Anthropic API key, managed by the engine"
          style={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
          <Inline justify="space-between">
            <Text color="txDisabled">Anthropic</Text>
            <Inline gap="sm">
              <Icon name="eye" size={18} color="txDisabled" />
              <Text color="txDisabled">••••••••••</Text>
            </Inline>
          </Inline>
        </View>
      </ScrollView>
    </Screen>
  );
}

function HostCard({
  host,
  selected,
  result,
  onSelect,
  testID,
}: {
  host: Host;
  selected: boolean;
  result: Reachability;
  onSelect: () => void;
  testID?: string;
}) {
  const theme = useTheme();

  const status: { text: string; color: 'txSuccess' | 'txError' | 'txTertiary' } =
    result.state === 'up'
      ? { text: result.root, color: 'txSuccess' }
      : result.state === 'down'
        ? { text: result.reason, color: 'txError' }
        : result.state === 'checking'
          ? { text: 'checking…', color: 'txTertiary' }
          : { text: '—', color: 'txTertiary' };

  return (
    <Pressable
      testID={testID}
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${host.label}${selected ? ', current' : ''}. ${host.daemonUrl}. ${status.text}`}
      style={{ borderRadius: theme.radius.lg }}>
      <Box
        p="lg"
        radius="lg"
        bg={selected ? 'bgAccent' : 'bgSolidCard'}
        border={selected ? 'medium' : 'hairline'}
        borderColor={selected ? 'bdAccent' : 'bdCard'}>
        <Inline gap="sm">
          <Text variant="heading">{host.label}</Text>
          {selected ? (
            <Text variant="caption" color="txAccent">
              current
            </Text>
          ) : null}
        </Inline>
        <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xs }}>
          {host.daemonUrl}
        </Text>
        {/* The workspace root, not a green dot — two machines both serving is
            the case this screen exists for, and only the root tells them apart. */}
        <Text variant="caption" color={status.color} style={{ paddingTop: theme.space.xxs }}>
          {status.text}
        </Text>
      </Box>
    </Pressable>
  );
}
