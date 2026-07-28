import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import {
  loadShowDotfiles,
  PreferencesProvider,
  useShowDotfiles,
  visibleEntries,
} from '../src/lib/preferences';

const entries = [
  { name: '.claude', dir: true },
  { name: 'CLAUDE.md', dir: false },
];

/** Stands in for a mounted listing screen (e.g. Explorer). */
function Listing() {
  const { showDotfiles } = useShowDotfiles();
  return (
    <>
      {visibleEntries(entries, showDotfiles).map((e) => (
        <Text key={e.name}>{e.name}</Text>
      ))}
    </>
  );
}

/** Stands in for the Settings modal stacked on top of it. */
function Toggle() {
  const { showDotfiles, setShowDotfiles } = useShowDotfiles();
  return (
    <Pressable onPress={() => setShowDotfiles(!showDotfiles)}>
      <Text>toggle</Text>
    </Pressable>
  );
}

describe('PreferencesProvider', () => {
  it('propagates a preference change to an already-mounted consumer, without remounting it', async () => {
    // This is the bug: Settings is a modal, so Explorer stays mounted
    // underneath it. Per-component `useState` gave each screen its own copy of
    // the preference, so flipping the toggle and dismissing the modal left the
    // list unchanged until the app restarted. A shared provider is the fix;
    // this test mounts both "screens" under one and asserts the listing's
    // rendered rows change without either component being torn down.
    await render(
      <PreferencesProvider>
        <Listing />
        <Toggle />
      </PreferencesProvider>,
    );

    // loadShowDotfiles() resolves asynchronously (AsyncStorage), so the
    // default only lands after an effect flush. Dotfiles are hidden by
    // default, so the listing starts without `.claude` and gains it — the
    // direction is incidental to what is under test, which is that an
    // already-mounted consumer sees the change at all.
    expect(await screen.findByText('CLAUDE.md')).toBeTruthy();
    expect(screen.queryByText('.claude')).toBeNull();

    fireEvent.press(screen.getByText('toggle'));

    expect(await screen.findByText('.claude')).toBeTruthy();
    expect(screen.getByText('CLAUDE.md')).toBeTruthy();
  });

  it('hides dotfiles until told otherwise', async () => {
    // The default is a decision, not an accident — reversed on device after
    // the first walk, where five of the workspace root's twenty entries turned
    // out to be editor and harness state. Pinned so a later refactor cannot
    // quietly restore the original "show everything" default.
    await AsyncStorage.clear();
    await expect(loadShowDotfiles()).resolves.toBe(false);
  });

  it('honours a stored preference over the default', async () => {
    await AsyncStorage.setItem('armillary.showDotfiles', 'true');
    await expect(loadShowDotfiles()).resolves.toBe(true);
  });

  it('throws when read outside a provider, so a screen cannot silently fall back to a private copy', async () => {
    // A component tree missing the provider is exactly the failure mode this
    // hoist exists to rule out — it must fail loudly, not quietly revert to
    // per-component state. `render` is async in RNTL v14, so the throw
    // surfaces as a rejection, not a synchronous exception.
    function Orphan() {
      useShowDotfiles();
      return null;
    }
    await expect(render(<Orphan />)).rejects.toThrow(
      /useShowDotfiles must be used inside PreferencesProvider/,
    );
  });
});
