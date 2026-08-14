import { useRouter } from 'expo-router';

import { relativeTime } from '@/lib/relative-time';
import type { Instance } from '@/lib/session/events';

import { CardRow, Roundel, Text } from './ui';

/**
 * A row in the Instances list, on CardRow (the spaced-card idiom).
 *
 * The note line answers the question a list of sessions is actually asked at a
 * glance — *when was this last one alive?* It used to carry `stream · seq`,
 * which reads as an id and a counter; both are still shown in full on the
 * instance panel, so nothing was lost, only demoted. `relativeTime` returns
 * `undefined` for a timestamp it cannot parse, and `CardRow` renders no note
 * line for an undefined `note` — so a malformed `startedAt` costs the row its
 * second line rather than printing `Invalid Date`.
 *
 * The trailing slot names the pilot — the model that runs this instance, or
 * `'engine default'` when none was pinned at creation — replacing the
 * chevron per CardRow's trailing contract (Task 8, per-instance-model plan).
 */
export function InstanceCard({
  instance,
  now,
  onLongPress,
}: {
  instance: Instance;
  /**
   * The instant to measure `startedAt` against, in milliseconds.
   *
   * A prop rather than a `Date.now()` in this component's body, for two
   * reasons. `react-hooks/purity` rejects the call outright — an impure read
   * during render produces a value that changes on any re-render nobody asked
   * for. And a list whose rows each read their own clock can disagree with
   * itself across a scroll; one instant per load means every row is measured
   * from the same place. The screen stamps it when the data arrives.
   */
  now: number;
  /** The archive sheet's entry point (design D2). The card stays dumb: the
   *  screen owns the sheet, this just reports the hold with its instance. */
  onLongPress?: (instance: Instance) => void;
}) {
  const router = useRouter();
  const operator = instance.operator ?? 'dispatcher';

  return (
    <CardRow
      leading={<Roundel name={operator} />}
      label={operator}
      note={relativeTime(instance.startedAt, now)}
      // `reading`, not `instrument`: "3h ago" is prose, so it takes Whyte
      // rather than the mono face the stream/seq pair it replaced was set in
      // (David, 2026-08-13).
      register="reading"
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
      onLongPress={onLongPress ? () => onLongPress(instance) : undefined}
    />
  );
}
