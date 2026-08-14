import { DropdownMenu, DropdownMenuItem } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { FILTERS, FILTER_LABELS, type Filter } from '@/lib/instance-filter';

import { Icon, Inline, Text as UIText } from './ui';

/**
 * The Android half of the pair — Jetpack Compose's `DropdownMenu`, which is the
 * same anchored affordance as iOS's pull-down and lands in the same place
 * relative to the trigger.
 *
 * See `instance-filter.ios.tsx` for why this is a platform pair at all; the
 * short version is that `@expo/ui/swift-ui` cannot be imported on Android.
 *
 * Two differences from the iOS side, both the platform's rather than ours.
 * `DropdownMenu` is **controlled** — it takes `expanded` and an
 * `onDismissRequest`, where SwiftUI's `Menu` owns its own open state — so the
 * `open` state below exists on this platform only. And the trigger goes in a
 * `DropdownMenu.Trigger` slot, which wraps it in a pressable of its own, so the
 * `Pressable` here only has to flip `open`.
 *
 * The trigger's composition is deliberately identical to the iOS file's, down
 * to the testID: the two platforms should differ in mechanics, never in
 * surface.
 */
export function InstanceFilter({
  value,
  onSelect,
}: {
  value: Filter;
  onSelect: (filter: Filter) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
      <DropdownMenu.Trigger>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Filter instances, showing ${value}`}
          onPress={() => setOpen(true)}>
          <Inline gap="xs" testID="instance-filter">
            <UIText variant="label" color="txPrimary">
              {FILTER_LABELS[value]}
            </UIText>
            <Icon name="chevronDown" size={14} color="icSecondary" />
          </Inline>
        </Pressable>
      </DropdownMenu.Trigger>

      <DropdownMenu.Items>
        {FILTERS.map((filter) => (
          <DropdownMenuItem
            key={filter}
            // `onClick`, not `onPress` — Compose's vocabulary, and the one
            // place this file cannot be a mirror of the iOS one.
            onClick={() => {
              setOpen(false);
              onSelect(filter);
            }}>
            <UIText>{FILTER_LABELS[filter]}</UIText>
          </DropdownMenuItem>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
