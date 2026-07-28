import { useRouter } from 'expo-router';

import type { Instance } from '@/lib/session/events';

import { ListRow } from './ui';

/**
 * A row in the Instances list: composed on `ListRow` — the house row, not a
 * hand-rolled `Pressable` — but still navigating THIS branch's route.
 *
 * `router.push`, not `Link asChild`: `ListRow` derives its own
 * `accessibilityRole` from whether it was given an `onPress` (see its own
 * comment), and a cloned `Link` element hands navigation down as a bare press
 * handler rather than through that prop — `TreeList` made the identical choice
 * for the same reason.
 */
export function InstanceCard({ instance }: { instance: Instance }) {
  const router = useRouter();

  return (
    <ListRow
      icon="inbox"
      label={instance.operator ?? 'dispatcher'}
      note={`${instance.stream} · seq ${instance.lastSeq}`}
      onPress={() => router.push(`/(tabs)/(instances)/${instance.id}`)}
    />
  );
}
