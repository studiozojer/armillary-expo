# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## After pulling: the install ritual

**A pull that touches `package.json` obligates `npm install` — and if the new dependency carries native code, the NEXT build must re-run pods.** Nothing in the pull tells you either. The failure ladder, walked end-to-end on 2026-08-06 (the expo-clipboard merge):

1. Pull without `npm install` → Metro fails at the first import the manifest promises but disk can't serve. Loud, cheap, obvious.
2. Build once in that state, THEN `npm install`, then build again → **the second build may skip pod install**, because the first one ran pods while `node_modules` lacked the module — autolinking scans `node_modules`, honestly recorded "nothing to link", and the re-run trusts that result. You now ship a JS bundle importing a native module the binary doesn't contain.
3. That crash hides until navigation: expo-router evaluates route files **lazily**, so the app launches clean and dies the moment you open the screen whose import needs the missing native module — and a Release build gives you no red box, just the exit.

The check when a screen crashes on open after a dependency landed: `grep <ModuleName> ios/Podfile.lock`. Zero hits means the pods layer is behind — `cd ios && pod install`, rebuild. The general shape, for recognition: *manifest outrunning disk*, each layer caching the shortfall of the one above it.

## Worktrees & isolation

This repo is **path-coupled** — a bare `git worktree add` gives you a tree that fails typecheck three ways, one missing sibling at a time. Use `./scripts/worktree.sh new <topic>` (and `rm <topic>` to tear down); it wires and then *verifies* by running `tsc`, so a tree that reports ready actually is one.

What it wires, and why each is invisible until it breaks:

- **`repos/armillary-core`** — a symlink in the **repo root**, not in the worktree. `__tests__/session-envelope.test.ts` imports the event schema by a relative path that climbs three levels; from a worktree those three levels land at the repo root.
- **`expo-env.d.ts`** — generated and gitignored, and it is what declares the CSS-module and `global.css` side-effect imports. Without it `tsc` fails on files nobody touched.
- **`.env.local`** — the per-machine inbox token. Absent, Capture uploads fail at runtime with no compile-time signal at all.

**Run jest and metro from the worktree, never from the main checkout.** `modulePathIgnorePatterns` now keeps the main checkout's suite out of `.worktrees/`; before it was added, one worktree silently doubled the suite to 54 tests and five of the duplicates failed on haste collisions — output that reads as five regressions rather than as a misconfigured glob.

**`jest.config.js` extends jest-expo's `transformIgnorePatterns`, never replaces it wholesale.** A prior version of this repo's config set its own array outright, which silently dropped the preset's own entries (`.pnpm`, `@sentry/react-native`, the reanimated-plugin and RN-babel-preset excludes) and cost a debugging day when two of them had to be rediscovered by hand mid-branch. Add a package that needs transforming to `extraTransformedPackages` in `jest.config.js`, not to a fresh standalone pattern.
