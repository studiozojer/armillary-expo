import type { Instance } from '@/lib/session/events';

import { Card, Stack, Text } from './ui';

export function InstanceCard({ instance }: { instance: Instance }) {
  return (
    <Card>
      <Stack gap="xxs">
        <Text variant="heading">{instance.operator ?? 'dispatcher'}</Text>
        <Text variant="caption" color="txTertiary">
          {instance.stream} · seq {instance.lastSeq}
        </Text>
      </Stack>
    </Card>
  );
}
