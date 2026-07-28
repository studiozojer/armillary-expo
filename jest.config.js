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
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
  transformIgnorePatterns: [
    presetAllowlist.replace(/\)\)$/, `|${extraTransformedPackages.join('|')}))`),
    ...presetRestPatterns,
  ],
};
