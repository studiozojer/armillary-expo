import { useRouter } from 'expo-router';

import type { Instance } from '@/lib/session/events';

import { CardRow, Icon, Inline, Roundel, Text } from './ui';

/**
 * A row in the Instances list, on CardRow (the spaced-card idiom).
 *
 * The note line is the honest data: stream · seq. When the engine serves a
 * topic and token usage, they take over this line — the layout already holds
 * the slot (design 2026-07-28, § Section 2).
 *
 * The trailing slot names the pilot — the model that runs this instance, or
 * `'engine default'` when none was pinned at creation — beside the chevron
 * rather than displacing it (Task 8, per-instance-model plan).
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
      trailing={
        <Inline gap="xs">
          <Text variant="caption" color="txTertiary">
            {instance.model ?? 'engine default'}
          </Text>
          <Icon name="chevron" size={14} color="icSecondary" />
        </Inline>
      }
      onPress={() => router.push(`/instance/${instance.id}`)}
    />
  );
}
