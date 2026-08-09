import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { DeviceEnrollment } from '@/components/device-enrollment';
import { Box, Button, Icon, Inline, Screen, SectionHeader, Stack as UIStack, Text } from '@/components/ui';
import { getAgentConsent, setAgentConsent, type AgentConsent, type AgentConsentKey } from '@/lib/agent-permissions';
import { useAuth } from '@/lib/auth/auth-context';
import { deviceRefusalOf } from '@/lib/auth/refusal';
import { daemonClientFor } from '@/lib/daemon/client';
import { DaemonError, type WhoamiResponse } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { probe, type Host, type Reachability } from '@/lib/hosts';
import { useShowDotfiles } from '@/lib/preferences';
import { useTheme } from '@/theme';

export default function Settings() {
  const theme = useTheme();
  const { host, hosts, setHost } = useHost();
  const { showDotfiles, setShowDotfiles } = useShowDotfiles();
  const [results, setResults] = useState<Record<string, Reachability>>({});
  // Fetched ONCE here rather than by each of `EnrollmentFacts` and
  // `AgentPermissions` separately — both want the same `/whoami` answer, and
  // two independent effects would fire two requests for one fact. Task 6's
  // own test pins the call count to exactly one; that pin is what caught this.
  const facts = useWhoamiFacts(host);

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
        <EnrollmentFacts facts={facts} />

        <Box style={{ paddingTop: theme.space.lg }}>
          <SectionHeader>Agent permissions</SectionHeader>
        </Box>
        <AgentPermissions host={host} facts={facts} />

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

/**
 * The device's own `/whoami` facts — name, grants, mint time — read once at
 * the `Settings` level and shared by `EnrollmentFacts` and `AgentPermissions`
 * below. One fetch, not two: both sections want the same answer to the same
 * question ("what does this host say this device may do"), and two
 * independent effects would double the request for one fact. Task 6's own
 * test pins the call count to exactly one while enrolled.
 *
 * Fires nothing while unenrolled — the `enrollment === 'enrolled'` gate below
 * — which is the whole of "the section shows the enrollment field as today"
 * for that state.
 */
function useWhoamiFacts(host: Host): WhoamiResponse | undefined {
  const { enrollment, ready, noteRefusal } = useAuth();
  const [facts, setFacts] = useState<WhoamiResponse | undefined>(undefined);

  useEffect(() => {
    // No state update on this branch, deliberately — every reader of this
    // hook already hides stale facts the instant `enrollment` stops being
    // `'enrolled'`, so there is nothing here worth synchronizing eagerly.
    if (!ready || enrollment !== 'enrolled') return;
    let cancelled = false;
    const controller = new AbortController();
    daemonClientFor(host.id, host.daemonUrl)
      .whoami(controller.signal)
      .then((response) => {
        if (!cancelled) setFacts(response);
      })
      .catch((error) => {
        if (cancelled) return;
        // A device may talk to an engine built before this route existed —
        // that 404s, and the honest degrade is silence, not an error banner:
        // every reader already reads correctly without these facts, because
        // it did for every version of the app before this task.
        if (error instanceof DaemonError && error.status === 404) {
          setFacts(undefined);
          return;
        }
        // A 401 here is device-refusal-shaped exactly like every mutating
        // route (`no_principal`/`unknown_principal`) — routed through the
        // same `noteRefusal` the other screens use, so a revoked token flips
        // `DeviceEnrollment`'s own state rather than this hook inventing a
        // second way to say the same thing.
        const refusal = error instanceof DaemonError ? deviceRefusalOf(error.message) : null;
        if (refusal) noteRefusal(refusal);
        setFacts(undefined);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ready, enrollment, host.id, host.daemonUrl, noteRefusal]);

  return facts;
}

/**
 * The device's own enrollment facts, read from the host rather than assumed.
 *
 * Rendered as a sibling of `DeviceEnrollment`, not inside it — that component
 * has no route to call and no reason to change shape here. Purely
 * presentational now: `facts` arrives from `useWhoamiFacts`, called once at
 * the `Settings` level and shared with `AgentPermissions` below.
 */
function EnrollmentFacts({ facts }: { facts: WhoamiResponse | undefined }) {
  const { enrollment } = useAuth();

  // `enrollment` gates this even before a host-switch's stale-fetch guard in
  // `useWhoamiFacts` would settle — the unenrolled render must never show a
  // previous host's facts for even one frame.
  if (enrollment !== 'enrolled' || !facts) return null;

  return (
    <Box px="lg" py="sm" testID="enrollment-facts">
      <UIStack gap="xs">
        <Text variant="label" color="txSecondary">
          {facts.name}
        </Text>
        <Inline gap="xs" style={{ flexWrap: 'wrap' }}>
          {facts.grants.map((grant) => (
            <Box key={grant} px="sm" py="xxs" radius="full" bg="bgSolidCard" border="hairline" borderColor="bdCard">
              <Text variant="caption" color="txSecondary">
                {grant}
              </Text>
            </Box>
          ))}
        </Inline>
      </UIStack>
    </Box>
  );
}

const AGENT_PERMISSION_ROWS: { key: AgentConsentKey; label: string }[] = [
  { key: 'sync', label: 'Sync' },
  { key: 'push', label: 'Push' },
  { key: 'commit', label: 'Commit' },
];

/**
 * Three toggles gating what an AGENT INSTANCE may reach for on this host's
 * repos — sync, push, commit. **Default ON**: D4 as amended (David, at
 * ratification) — absent stored state reads as consented, because this store
 * is a revocation surface layered under the device's own `/whoami` grants,
 * not an opt-in gate in front of them. See `lib/agent-permissions.ts`'s own
 * doc comment for the full reasoning; do not "fix" this to off-by-default.
 *
 * Renders independently of enrollment — the consent record is a fact about
 * this phone's own willingness, not about whether it currently holds a valid
 * token. What DOES depend on enrollment is whether a toggle can be proven
 * moot: without `/whoami` facts (unenrolled, or an engine predating the
 * route), every row renders live rather than guessing a grant is absent.
 * `facts` arrives from `useWhoamiFacts`, called once at the `Settings` level
 * and shared with `EnrollmentFacts` above — this component fetches nothing.
 */
function AgentPermissions({ host, facts }: { host: Host; facts: WhoamiResponse | undefined }) {
  const [consent, setConsent] = useState<AgentConsent | undefined>(undefined);

  // Consent is read fresh on every host change — it is per-host state, same
  // as the token it sits beside.
  useEffect(() => {
    let cancelled = false;
    void getAgentConsent(host.id).then((value) => {
      if (!cancelled) setConsent(value);
    });
    return () => {
      cancelled = true;
    };
  }, [host.id]);

  const onToggle = useCallback(
    (key: AgentConsentKey, next: boolean) => {
      // Optimistic: the UI reflects the tap immediately rather than waiting
      // on a Keychain round trip. Unlike `setShowDotfiles`/`saveShowDotfiles`
      // though, a failed write here can't be shrugged off — this store is
      // what `send()` reads, so UI-says-revoked/store-says-consented is the
      // same silent-widen shape a lost write would be. A rejection reverts
      // the flip rather than leaving the screen claiming a state the store
      // never actually holds.
      setConsent((prev) => (prev ? { ...prev, [key]: next } : prev));
      setAgentConsent(host.id, key, next).catch(() => {
        setConsent((prev) => (prev ? { ...prev, [key]: !next } : prev));
      });
    },
    [host.id],
  );

  // Nothing to render until the store answers — no flash of a default that
  // might not match what is actually held for this host.
  if (!consent) return null;

  return (
    <UIStack gap="xs">
      {AGENT_PERMISSION_ROWS.map(({ key, label }) => {
        // Absent `facts` (unenrolled, or an engine that hasn't answered yet)
        // means "not proven absent" — the row stays live rather than
        // guessing dim. Only an explicit grant list that OMITS this key
        // proves the toggle would gate nothing.
        const grantAbsent = facts !== undefined && !facts.grants.includes(key);
        return (
          <AgentPermissionToggle
            key={key}
            testID={`agent-permission-${key}`}
            label={label}
            value={consent[key]}
            disabled={grantAbsent}
            reason={grantAbsent ? `This device isn't granted ${key} — the toggle would gate nothing.` : undefined}
            onToggle={(next) => onToggle(key, next)}
          />
        );
      })}
    </UIStack>
  );
}

/**
 * One toggle row, presentational only — the throw-instrumented test in
 * `settings-agent-permissions.test.tsx` renders this directly rather than
 * through the full screen, so the "disabled means the handler truly never
 * fires" proof is independent of any network mocking.
 *
 * `disabled` is passed straight to `Pressable`'s own prop, not just into
 * `accessibilityState` — that is what makes the silence real: React Native
 * refuses to invoke `onPress` at all on a disabled `Pressable`, rather than
 * this component having to remember to gate the call itself.
 */
export function AgentPermissionToggle({
  testID,
  label,
  value,
  disabled,
  reason,
  onToggle,
}: {
  testID: string;
  label: string;
  value: boolean;
  disabled: boolean;
  reason?: string;
  onToggle: (next: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : () => onToggle(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={`${label}${reason ? `. ${reason}` : ''}`}
      accessibilityState={{ checked: value, disabled }}>
      <Box px="lg" py="md">
        <Inline justify="space-between">
          <Text color={disabled ? 'txDisabled' : 'txPrimary'}>{label}</Text>
          <Text variant="label" color={disabled ? 'txDisabled' : 'txAccent'}>
            {value ? 'On' : 'Off'}
          </Text>
        </Inline>
        {reason ? (
          <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xxs }}>
            {reason}
          </Text>
        ) : null}
      </Box>
    </Pressable>
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
