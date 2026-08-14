import { Host, Picker } from '@expo/ui';

import { FILTERS, FILTER_LABELS, type Filter } from '@/lib/instance-filter';

/**
 * The base of a three-file platform set, and the one **web** resolves to.
 *
 * Metro picks `instance-filter.ios.tsx` on iOS and `.android.tsx` on Android;
 * this file is what is left. It follows the `app-tabs.tsx` / `app-tabs.web.tsx`
 * pair already in this directory — a base plus platform overrides — rather than
 * introducing a second convention.
 *
 * It also exists so **TypeScript** can resolve `@/components/instance-filter`
 * at all: `tsc` does not know about Metro's platform extensions, so without a
 * base file the import fails to typecheck even though every runtime resolves it
 * fine. Declaring the module in a `.d.ts` would have satisfied the compiler
 * while leaving web genuinely broken; a real implementation satisfies both.
 *
 * Uses `@expo/ui`'s **universal** `Picker`, which renders through
 * `react-native-web` here. The trade is stated plainly because it is a real
 * one: `Picker` exposes no label slot, so on web the trigger is the system
 * control rather than the Whyte-and-chevron composition the two native files
 * keep. That is the right way round — the native platforms are the ones being
 * walked, and a web fallback that works beats one that matches.
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
      <Picker
        testID="instance-filter"
        appearance="menu"
        selectedValue={value}
        onValueChange={(next) => onSelect(next as Filter)}>
        {FILTERS.map((filter) => (
          <Picker.Item key={filter} label={FILTER_LABELS[filter]} value={filter} />
        ))}
      </Picker>
    </Host>
  );
}
