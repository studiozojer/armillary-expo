import { useState } from 'react';
import { TextInput } from 'react-native';

import { Box, Button, Inline, Stack, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/auth-context';
import type { Host } from '@/lib/hosts';
import { useTheme } from '@/theme';

/**
 * Enrolling THIS device on the selected host.
 *
 * # Why this is a paste field and not a button
 *
 * There is no enrolment endpoint, deliberately: the engine's design keeps the
 * unauthenticated surface from growing, so a token is minted by a host CLI
 * (`armillary-engine enroll --name <name> --grants sync,push`) and printed
 * exactly once. It is never recoverable — a lost token is re-enrolled, not
 * looked up. So the only thing this screen can do is accept the string, and
 * the only honest instruction is the command that produces it.
 *
 * # Why it names the host it is enrolling against
 *
 * The registry is host-local by construction, so a token minted on benatky
 * authenticates against nothing on stjerneborg. Pasting the right token
 * against the wrong host is a mistake this screen should make hard to commit,
 * and the fix is to say which machine is being enrolled rather than to say
 * "this device".
 */
export function DeviceEnrolment({ host }: { host: Host }) {
  const theme = useTheme();
  const { enrolment, canEnrol, ready, enrol, unenrol } = useAuth();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await enrol(value);
      // Cleared only on success. A token that failed to store should stay in
      // the field — it was printed once and cannot be looked up again, so
      // wiping it on failure destroys the only copy the user has.
      setValue('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not store the token.');
    } finally {
      setBusy(false);
    }
  };

  if (!canEnrol) {
    return (
      <Box px="lg" py="md" testID="enrolment-unavailable">
        <Text variant="caption" color="txTertiary">
          This platform has no secure storage, so a device token can’t be held here. The web build
          stays read-only.
        </Text>
      </Box>
    );
  }

  return (
    <Box px="lg" py="md" testID="device-enrolment">
      <Stack gap="sm">
        <Inline justify="space-between">
          <Text>{host.label}</Text>
          <Text
            variant="label"
            color={
              !ready
                ? 'txTertiary'
                : enrolment === 'enrolled'
                  ? 'txSuccess'
                  : enrolment === 'rejected'
                    ? 'txError'
                    : 'txTertiary'
            }>
            {!ready
              ? '…'
              : enrolment === 'enrolled'
                ? 'Enrolled'
                : enrolment === 'rejected'
                  ? 'Token rejected'
                  : 'Not enrolled'}
          </Text>
        </Inline>

        {enrolment === 'enrolled' ? (
          <Stack gap="xs">
            <Text variant="caption" color="txTertiary">
              {/* Deliberately not "you can push". Whether this device holds
                  `push` as well as `sync` is not knowable from here — no route
                  reports a principal's grants — so claiming it would be a
                  guess the engine would then contradict. */}
              This device holds a token for {host.label}. Which authorities it was granted is
              decided on the host.
            </Text>
            <Button label="Remove token" variant="secondary" onPress={() => void unenrol()} />
          </Stack>
        ) : (
          <Stack gap="xs">
            <Text variant="caption" color="txTertiary">
              {enrolment === 'rejected'
                ? `${host.label} no longer recognises this device’s token — it may have been revoked. Mint a new one and paste it below.`
                : `Mint a token on ${host.label} and paste it here. Reads work without one; fetch, pull, push and sending to an instance don’t.`}
            </Text>
            <Text variant="caption" color="txSecondary">
              armillary-engine enroll --name &lt;device&gt; --grants sync,push
            </Text>
            <TextInput
              testID="enrolment-input"
              value={value}
              onChangeText={setValue}
              placeholder="Paste the token"
              placeholderTextColor={theme.color.txTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              // Not `secureTextEntry`: the token is printed once and never
              // recoverable, so a user pasting it needs to be able to SEE
              // that it arrived intact. Masking a value nobody can look up
              // again turns a typo into a re-enrolment.
              style={{
                color: theme.color.txPrimary,
                backgroundColor: theme.color.bgSolidCard,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.space.md,
                paddingVertical: theme.space.sm,
              }}
            />
            {error ? (
              <Text variant="caption" color="txError">
                {error}
              </Text>
            ) : null}
            <Button
              label={busy ? 'Enrolling…' : 'Enrol this device'}
              onPress={() => void submit()}
              disabled={busy || value.trim().length === 0}
            />
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
