import { useRouter } from 'expo-router';

import { relativeTime } from '@/lib/relative-time';
import type { Instance } from '@/lib/session/events';

import { CardRow, Roundel, Text } from './ui';

/**
 * A row in the Instances list, on CardRow (the spaced-card idiom).
 *
 * Two facts about an instance, on two lines: **which model is piloting it**
 * under the operator's name, and **how long ago it started** in the trailing
 * slot (David, 2026-08-13 — these began the other way round).
 *
 * The note line used to carry `stream · seq`, which reads as an id and a
 * counter; both are still shown in full on the instance panel, so nothing was
 * lost, only demoted.
 *
 * `relativeTime` returns `undefined` for a timestamp it cannot parse — the wire
 * JSON is cast without validation, so that shape can actually arrive — and the
 * trailing text falls to empty rather than printing `Invalid Date`.
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
      note={instance.model ?? 'engine default'}
      // `reading`, not `instrument`: Whyte on the subtext line (David,
      // 2026-08-13). The instruction was about this SLOT, so it still holds now
      // that the slot carries the model rather than the age.
      register="reading"
      trailing={
        // Always an ELEMENT, never `undefined` — even when there is no age to
        // show. `CardRow` reads an undefined trailing as "the caller supplied
        // nothing" and draws its chevron, so a `startedAt` the wire malformed
        // would otherwise grow a chevron no other row has. `?? ''` is the whole
        // guard.
        //
        // `flexShrink: 1` — `numberOfLines={1}` alone stops the caption
        // WRAPPING but not SHRINKING: RN's default `flexShrink: 0` (and
        // `Inline` sets none) leaves this `Text` at its full intrinsic width,
        // so the label lane (`Stack flex={1}`) shrinks instead and the trailing
        // text truncates the OPERATOR name rather than itself.
        <Text variant="caption" color="txTertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {relativeTime(instance.startedAt, now) ?? ''}
        </Text>
      }
      onPress={() => router.push(`/instance/${instance.id}`)}
      onLongPress={onLongPress ? () => onLongPress(instance) : undefined}
    />
  );
}
