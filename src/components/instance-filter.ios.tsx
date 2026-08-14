import { Host } from '@expo/ui';
import { Button, Menu, RNHostView } from '@expo/ui/swift-ui';
import { StyleSheet, View } from 'react-native';

import { FILTERS, FILTER_LABELS, type Filter } from '@/lib/instance-filter';

import { Icon, Inline, Text as UIText } from './ui';

/**
 * The state name the trigger holds space for. See the comment at its use.
 *
 * Longest by CHARACTER COUNT, which is a heuristic — Whyte is proportional, so
 * more characters is not strictly more width. It is exact for the two names
 * that exist ("Active", "Archived") and stays close for anything plausible;
 * a name that broke it would show up as a clipped chevron on the next walk,
 * which is how this one was found.
 */
const WIDEST_LABEL = FILTERS.map((filter) => FILTER_LABELS[filter]).reduce((widest, label) =>
  label.length > widest.length ? label : widest,
);

/**
 * The instance filter, as iOS's anchored pull-down menu.
 *
 * It was an `ActionSheetIOS` first, which was the wrong platform answer even
 * though it was *a* platform answer: a sheet is modal and rises from the
 * bottom, while a chevron beside a label promises a menu that opens under the
 * control. The archive sheet a few lines away in the screen is still correct —
 * that one is a contextual action set invoked by long-pressing a row, which is
 * what sheets are for. (David, 2026-08-13: *"it's really weird that it's a
 * modal"*.)
 *
 * **`@expo/ui/swift-ui` is an iOS-only import** — it crashes at runtime on
 * Android ("Unable to get view config"), and a `Platform.OS` guard would not
 * help, because the crash is in the module import rather than the render. So
 * this is a real `.ios.tsx` / `.android.tsx` pair. It lives in `components/`
 * and not in the route file for the same reason: Expo Router does not resolve
 * platform extensions for files under `app/`.
 *
 * `RNHostView` is what keeps the surface ours. `Menu.label` accepts a node, and
 * `RNHostView` embeds a React Native subtree inside the SwiftUI one — so the
 * trigger below is the exact `Inline`/`UIText`/`Icon` composition it always
 * was, in Whyte, rather than a system-drawn button. That division is the
 * `platform-idiom` practice's line held in one component: the platform owns the
 * menu's mechanics, the studio owns the trigger's surface. The alternative
 * (`@expo/ui`'s universal `Picker`) is one cross-platform tree, but it exposes
 * no label slot at all and would have replaced the trigger with the system's.
 *
 * The checkmark on the selected row is the platform's own convention for a
 * menu standing in for a picker; it is what makes the current state legible
 * once the menu is open.
 */
export function InstanceFilter({
  value,
  onSelect,
}: {
  value: Filter;
  onSelect: (filter: Filter) => void;
}) {
  return (
    <Host matchContents>
      <Menu
        label={
          <RNHostView matchContents>
            {/* `Inline` forwards no accessibility props, and SwiftUI's `Menu`
                supplies the tap rather than a `Pressable`, so without this
                wrapper the control announced as bare static text. It was an
                `AXButton` before the menu; it is one again. */}
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Filter instances, showing ${value}`}>
              <Inline gap="xs" testID="instance-filter">
                {/*
                  The trigger reserves the width of the LONGEST state name in
                  every state, so its intrinsic size never changes.

                  This is not defensive padding — it is the whole reason the
                  chevron survives. `RNHostView` sizes itself to its children
                  **once, on mount** (its own source says so), and a SwiftUI
                  `Menu` label slot keeps that measurement: walked on
                  2026-08-13, the frame measured for "Active ⌄" stayed 0.146 of
                  screen width when the label became "Archived" at 0.142, and
                  the chevron was pushed past the right edge and clipped.
                  Remounting with a `key` was tried first and did NOT
                  re-measure.

                  So the invisible copy below holds the box open at its widest,
                  and the real label is laid over it. One measurement, correct
                  for every state.
                */}
                <View>
                  <UIText variant="label" style={{ opacity: 0 }}>
                    {WIDEST_LABEL}
                  </UIText>
                  <UIText
                    variant="label"
                    color="txPrimary"
                    numberOfLines={1}
                    style={StyleSheet.absoluteFill}>
                    {FILTER_LABELS[value]}
                  </UIText>
                </View>
                <Icon name="chevronDown" size={14} color="icSecondary" />
              </Inline>
            </View>
          </RNHostView>
        }>
        {FILTERS.map((filter) => (
          <Button
            key={filter}
            testID={`instance-filter-${filter}`}
            label={FILTER_LABELS[filter]}
            systemImage={filter === value ? 'checkmark' : undefined}
            onPress={() => onSelect(filter)}
          />
        ))}
      </Menu>
    </Host>
  );
}
