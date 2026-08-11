import { useRouter } from 'expo-router';

import type { Instance } from '@/lib/session/events';

import { CardRow, Roundel, Text } from './ui';

/**
 * A row in the Instances list, on CardRow (the spaced-card idiom).
 *
 * The note line is the honest data: stream · seq. When the engine serves a
 * topic and token usage, they take over this line — the layout already holds
 * the slot (design 2026-07-28, § Section 2).
 *
 * The trailing slot names the pilot — the model that runs this instance, or
 * `'engine default'` when none was pinned at creation — replacing the
 * chevron per CardRow's trailing contract (Task 8, per-instance-model plan).
 */
export function InstanceCard({ instance }: { instance: Instance }) {
  const router = useRouter();
  const operator = instance.operator ?? 'dispatcher';

  return (
    <CardRow
      leading={<Roundel name={operator} />}
      label={operator}
      note={`${instance.stream} · seq ${instance.lastSeq}`}
      register="instrument"
      trailing={
        // `flexShrink: 1` — `numberOfLines={1}` alone stops the caption
        // WRAPPING but not SHRINKING: RN's default `flexShrink: 0` (and
        // `Inline` sets none) leaves this `Text` at its full intrinsic
        // width, so the label lane (`Stack flex={1}`) shrinks instead and a
        // long model slug truncates the OPERATOR name, not the model.
        <Text variant="caption" color="txTertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {instance.model ?? 'engine default'}
        </Text>
      }
      onPress={() => router.push(`/instance/${instance.id}`)}
    />
  );
}
