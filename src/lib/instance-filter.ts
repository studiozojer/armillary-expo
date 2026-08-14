/**
 * The two states the Instances list filters between.
 *
 * D3 of the 2026-08-11 instance-archive design: two states, no "All". Kept in
 * `lib/` rather than beside either component because three places need the same
 * answer — the screen (which does the filtering and owns the state) and both
 * platform builds of `InstanceFilter`, which cannot import from each other.
 *
 * `FILTERS` order is the order the menu offers them in.
 */
export const FILTERS = ['active', 'archived'] as const;

export type Filter = (typeof FILTERS)[number];

export const FILTER_LABELS: Record<Filter, string> = {
  active: 'Active',
  archived: 'Archived',
};
