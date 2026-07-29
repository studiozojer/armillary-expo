import { useRouter } from 'expo-router';

import type { Instance } from '@/lib/session/events';

import { CardRow, Roundel } from './ui';

/**
 * A row in the Instances list, on CardRow (the spaced-card idiom).
 *
 * The note line is the honest data: stream · seq. When the engine serves a
 * topic and token usage, they take over this line — the layout already holds
 * the slot (design 2026-07-28, § Section 2).
 */
export function InstanceCard({ instance }: { instance: Instance }) {
  const router = useRouter();
  const operator = instance.operator ?? 'dispatcher';

  return (
    <CardRow
      leading={<Roundel name={operator} />}
      label={operator}
      note={`${instance.stream} · seq ${instance.lastSeq}`}
      noteVariant="mono"
      onPress={() => router.push(`/(tabs)/(instances)/${instance.id}`)}
    />
  );
}
