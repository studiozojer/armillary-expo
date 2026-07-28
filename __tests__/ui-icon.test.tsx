import { ICONS } from '../src/components/ui/icon';

describe('<Icon>', () => {
  it('names every icon on BOTH platforms', () => {
    // This is the assertion that actually prevents a blank render. expo-symbols
    // reads name['web'] (or ['android']) off-Apple; if that key is missing it
    // renders props.fallback, which is nothing. An icon named only for iOS
    // therefore looks perfect on device and is invisible everywhere else — the
    // failure is total and silent, and no device walk would catch it.
    for (const [name, spec] of Object.entries(ICONS)) {
      expect(spec.ios).toBeTruthy();
      expect(spec.web).toBeTruthy();
      expect(name).not.toBe('');
    }
  });

  it('covers everything the Explorer rows need', () => {
    for (const required of ['folder', 'file', 'chevron'] as const) {
      expect(ICONS).toHaveProperty(required);
    }
  });
});
