import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';

import { Box, Button, Inline, Stack, Text } from '@/components/ui';
import { usePushToken } from '@/lib/notifications';

/**
 * The doorbell's Settings row: surface this device's Expo push token so it can
 * be placed wherever a watcher reads it.
 *
 * # Why this is a copy field and not a registration button
 *
 * There is no token-registration endpoint yet, deliberately — same reasoning
 * as device enrollment above it: the engine's unauthenticated surface must not
 * grow, and the enrolled-device write path for push tokens is phase-2 work
 * (the core notify protocol). Until then the token travels by hand: copy it
 * here, paste it where the ringing side is configured. Ringing it is one POST:
 *
 *   curl -s https://exp.host/--/api/v2/push/send \
 *     -H 'content-type: application/json' \
 *     -d '{"to":"<token>","title":"…","body":"…"}'
 */
export function PushDoorbell() {
  const { status, enable } = usePushToken();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (token: string) => {
    void Clipboard.setStringAsync(token).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  switch (status.state) {
    case 'unsupported':
      return (
        <Caption testID="push-unsupported">
          Push notifications need a native build — the web build has no doorbell.
        </Caption>
      );
    case 'no-project':
      return (
        <Caption testID="push-no-project">
          No EAS project is configured (app.json → extra.eas.projectId), so no push token can be
          minted. Run `eas init` in the repo and rebuild.
        </Caption>
      );
    case 'loading':
      return <Caption testID="push-loading">…</Caption>;
    case 'undetermined':
      return (
        <Box px="lg" py="md" testID="push-undetermined">
          <Stack gap="sm">
            <Text variant="caption" color="txTertiary">
              Let watchers ring this phone when an event lands. iOS asks exactly once — a denial
              here is permanent until flipped in the system Settings.
            </Text>
            <Inline>
              <Button label="Enable notifications" onPress={enable} testID="push-enable" />
            </Inline>
          </Stack>
        </Box>
      );
    case 'denied':
      return (
        <Caption testID="push-denied">
          Notifications are denied for this app. iOS never re-prompts — enable them in the system
          Settings, then reopen this screen.
        </Caption>
      );
    case 'error':
      return (
        <Box px="lg" py="md" testID="push-error">
          <Text variant="caption" color="txError">
            {status.reason}
          </Text>
        </Box>
      );
    case 'ready':
      return (
        <Box px="lg" py="md" testID="push-ready">
          <Stack gap="sm">
            <Text variant="caption" color="txSecondary">
              {status.token}
            </Text>
            <Inline justify="space-between">
              <Button
                label={copied ? 'Copied' : 'Copy token'}
                variant="secondary"
                onPress={() => copy(status.token)}
                testID="push-copy"
              />
            </Inline>
            <Text variant="caption" color="txTertiary">
              Anything holding this token can ring this phone via the Expo push API. Paste it into
              the watcher that should ring you.
            </Text>
          </Stack>
        </Box>
      );
  }
}

function Caption({ children, testID }: { children: string; testID: string }) {
  return (
    <Box px="lg" py="md" testID={testID}>
      <Text variant="caption" color="txTertiary">
        {children}
      </Text>
    </Box>
  );
}
