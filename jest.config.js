// Moved out of package.json because merging jest-expo's own preset requires a
// `require(...)` call, which JSON cannot express.
//
// This used to replace jest-expo's `transformIgnorePatterns` wholesale rather
// than extend it. That silently dropped the preset's own entries — `.pnpm`,
// `@sentry/react-native`, and the negative patterns excluding the reanimated
// babel plugin and the RN babel preset from transformation — which cost a
// debugging day mid-branch when two of them had to be rediscovered and
// re-added by hand. Spreading the preset's array and layering this repo's own
// extra packages onto its allowlist means a future jest-expo upgrade changes
// what this starts from, not what silently vanishes underneath it.
const jestExpoPreset = require('jest-expo/jest-preset');

const [presetAllowlist, ...presetRestPatterns] = jestExpoPreset.transformIgnorePatterns;

// Packages this repo needs transformed that jest-expo's own allowlist does
// not already cover.
const extraTransformedPackages = [
  '@unimodules',
  'unimodules',
  'sentry-expo',
  'react-native-svg',
  'react-native-marked',
  'marked',
  'github-slugger',
];

module.exports = {
  preset: 'jest-expo',
  // AsyncStorage's native module is not auto-mocked by jest-expo, and two
  // branches reached for it independently: a `jest.mock` in a setup file (the
  // vendor's own documented answer) and a `moduleNameMapper` entry pointing at
  // the same mock. They cannot both be here. The mapper rewrites the bare
  // specifier to the mock's path *before* jest looks up registered mocks, so
  // the `jest.mock` factory's own `require` of that path resolves back onto
  // itself — `RangeError: Maximum call stack size exceeded`, in 14 suites at
  // once. The setup file is what survives, because it is what the vendor's own
  // error message tells you to write.
  //
  // Some form of it is not optional: without it every test that renders a
  // component fails, because `useTheme` reaches `theme-context`, which imports
  // AsyncStorage.
  setupFiles: ['<rootDir>/jest.setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  transformIgnorePatterns: [
    presetAllowlist.replace(/\)\)$/, `|${extraTransformedPackages.join('|')}))`),
    ...presetRestPatterns,
  ],
};
