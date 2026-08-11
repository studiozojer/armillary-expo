// jest-expo does not auto-mock AsyncStorage's native module. Its own error
// message points here: https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// react-native-safe-area-context's own hooks throw outside a `SafeAreaProvider`
// ancestor ("No safe area value available…"), and most of this repo's screen
// tests render a screen directly with no such provider (the established
// convention here — see e.g. session-screen.test.tsx's own comment on why it
// renders standalone rather than through a full navigator). The library ships
// exactly this fallback for that reason — same shape as the AsyncStorage mock
// above: falls back to a zeroed inset/frame instead of throwing when no
// Provider is present, while still reading a real Provider's context when a
// test supplies one (e.g. to assert on a specific inset value).
jest.mock('react-native-safe-area-context', () => {
  // The mock file is `export default {...}` with no named exports; Babel's
  // ESM interop puts that under a `.default` key when required from plain
  // CJS, which left every named import (`SafeAreaProvider`,
  // `useSafeAreaInsets`, ...) resolving to `undefined` — unwrap it.
  const mocked = require('react-native-safe-area-context/jest/mock');
  return mocked.default ?? mocked;
});

// react-native-drawer-layout drives its pan gesture through Reanimated, whose
// worklets layer calls into a native module on import (`loadUnpackers`), so the
// import alone fails under jest — `TypeError: Cannot read properties of
// undefined (reading 'loadUnpackers')`, taking down every suite that renders
// the chat screen.
//
// The mock keeps the OBSERVABLE contract rather than stubbing the component to
// nothing: closed renders only the children, open renders the children *and*
// the drawer content. That is the whole of what a test can legitimately assert
// about this component — the gesture and the animation are the library's, and
// a test that pretended to cover them would be asserting against this mock.
jest.mock('react-native-drawer-layout', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Drawer: ({ open, children, renderDrawerContent }) =>
      React.createElement(
        React.Fragment,
        null,
        children,
        open ? React.createElement(View, { testID: 'drawer' }, renderDrawerContent()) : null,
      ),
  };
});

// expo-secure-store reaches for the Keychain through a native binding that
// does not exist under jest. Same treatment as AsyncStorage above, and for the
// same reason: without it every suite that renders a screen fails, because the
// screen tree now includes AuthProvider, which hydrates the device token.
//
// An in-memory map rather than `jest.fn()` returning null, so a test can SEED
// a token and exercise the enrolled path — `token-store.test.ts` and the repo
// screen's gate tests both need that, and a mock that can only ever answer
// "no token" would make the enrolled path untestable while looking fine.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});
