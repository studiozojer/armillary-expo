import { FILTERS, FILTER_LABELS } from '../src/lib/instance-filter';

describe('the instance filter states', () => {
  /**
   * D3 of the 2026-08-11 instance-archive design: two states, no "All".
   *
   * Not a change-detector — this has already drifted once. The build installed
   * on the simulator on 2026-08-13 shipped an "All" filter, from before D3 was
   * ratified. Pinning the set here means a third state cannot be added without
   * someone deleting this test and meeting the decision it records.
   */
  it('offers exactly Active and Archived, and no "All"', () => {
    expect(FILTERS).toEqual(['active', 'archived']);
    expect(Object.values(FILTER_LABELS)).not.toContain('All');
  });

  it('labels every state it offers', () => {
    for (const filter of FILTERS) {
      expect(FILTER_LABELS[filter]).toBeTruthy();
    }
  });
});
