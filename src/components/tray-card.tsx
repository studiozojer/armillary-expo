import { useRouter } from 'expo-router';

import { resolveTrayOpen, type Arrival } from '@/lib/daemon/tray';
import { useHost } from '@/lib/host-context';
import { hostByName } from '@/lib/push-deep-link';
import { useTheme } from '@/theme';

import { Box, CardRow, Text } from './ui';

/**
 * One arrival, on CardRow.
 *
 * The summary is the label — for the augur that is the same line the push
 * carried, built without a model. The sender sits on the note line and the
 * date on the title line beside the summary, so a screen reader hears all
 * three (CardRow folds label, secondary and note into its announcement). The
 * origin machine is the trailing chip, which CardRow does NOT announce — the
 * standing finding on the board (2026-08-13) — so the chip is a visual fact
 * only until the component's contract changes.
 */
export function TrayCard({ entry }: { entry: Arrival }) {
  const router = useRouter();
  const theme = useTheme();
  const { host, setHost } = useHost();

  const open = () => {
    const action = resolveTrayOpen({ entry, currentHostId: host.id });
    if (action.switchToHostId) {
      const target = hostByName(action.switchToHostId);
      if (target) setHost(target);
    }
    router.push(action.href);
  };

  return (
    <CardRow
      testID={`tray-card-${entry.id}`}
      label={entry.summary}
      secondary={entry.date}
      note={entry.sender}
      register="instrument"
      trailing={
        <Box
          px="sm"
          radius="full"
          bg="bgSolidCardSecondary"
          style={{ paddingVertical: theme.space.xs, flexShrink: 1 }}>
          <Text variant="caption" color="txTertiary" numberOfLines={1}>
            {entry.hostLabel}
          </Text>
        </Box>
      }
      onPress={open}
    />
  );
}
