import { resolveDeepLink } from '../src/lib/push-deep-link';

const DATA = { host: 'stjerneborg', path: 'operators/augur/field/2026-08-30.md' };
const base = {
  data: DATA,
  navReady: true,
  notificationId: 'n1',
  handledId: null as string | null,
  currentHostId: 'benatky',
};

describe('resolveDeepLink', () => {
  /**
   * THE REGRESSION, and the reason this is a pure function rather than a
   * component test.
   *
   * The first build shipped without this guard and crashed on launch, every
   * launch, before drawing a frame. The handler renders ABOVE <Stack> in the
   * root layout, so its effect runs before a navigator exists and expo-router
   * throws on a push made then; `useLastNotificationResponse` returns the last
   * response *persistently*, not only when a tap launched the app, so once any
   * deep-linking push had ever arrived the effect fired on every cold start.
   *
   * It reached a phone with a green suite because the tests covered only
   * `readDeepLink`/`hostByName`, neither of which mounts anything — and a
   * component test could not have saved it either: this repo's jest setup runs
   * mount effects for the FIRST render() in a file and none after, so such a
   * test passes against broken code. See the note on `resolveDeepLink`.
   */
  it('refuses to navigate before the root navigator is ready', () => {
    expect(resolveDeepLink({ ...base, navReady: false })).toBeNull();
  });

  it('navigates once the navigator is ready', () => {
    expect(resolveDeepLink(base)).toEqual({
      href: '/browse/operators/augur/field/2026-08-30.md',
      switchToHostId: 'stjerneborg',
      notificationId: 'n1',
    });
  });

  /** A path is meaningless without its machine, so the host switch is required. */
  it('asks for the host the bell named when it is not the current one', () => {
    expect(resolveDeepLink(base)?.switchToHostId).toBe('stjerneborg');
  });

  it('does not switch host when already on it', () => {
    expect(resolveDeepLink({ ...base, currentHostId: 'stjerneborg' })?.switchToHostId).toBeUndefined();
  });

  /**
   * An unknown machine must not drag the user off their current host — the
   * file would 404 and read as a report that failed to write.
   */
  it('leaves the host alone when the bell names a machine this build lacks', () => {
    const r = resolveDeepLink({ ...base, data: { host: 'nowhere', path: 'a/b.md' } });
    expect(r?.href).toBe('/browse/a/b.md');
    expect(r?.switchToHostId).toBeUndefined();
  });

  /** Every push sent before data_template existed, and the doorbell test ring. */
  it('does nothing for a notification with no deep link', () => {
    expect(resolveDeepLink({ ...base, data: undefined })).toBeNull();
    expect(resolveDeepLink({ ...base, data: { host: 'stjerneborg' } })).toBeNull();
  });

  /** The hook re-delivers the same response on every mount. */
  it('does nothing for a notification already acted on', () => {
    expect(resolveDeepLink({ ...base, handledId: 'n1' })).toBeNull();
    expect(resolveDeepLink({ ...base, handledId: 'n0' })).not.toBeNull();
  });

  it('strips leading slashes so the route is never doubled', () => {
    expect(resolveDeepLink({ ...base, data: { path: '/a/b.md' } })?.href).toBe('/browse/a/b.md');
  });
});
