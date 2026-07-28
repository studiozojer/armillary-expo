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
