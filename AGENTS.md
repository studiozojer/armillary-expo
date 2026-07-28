# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Worktrees & isolation

This repo is **path-coupled** — a bare `git worktree add` gives you a tree that fails typecheck three ways, one missing sibling at a time. Use `./scripts/worktree.sh new <topic>` (and `rm <topic>` to tear down); it wires and then *verifies* by running `tsc`, so a tree that reports ready actually is one.

What it wires, and why each is invisible until it breaks:

- **`repos/armillary-core`** — a symlink in the **repo root**, not in the worktree. `__tests__/session-envelope.test.ts` imports the event schema by a relative path that climbs three levels; from a worktree those three levels land at the repo root.
- **`expo-env.d.ts`** — generated and gitignored, and it is what declares the CSS-module and `global.css` side-effect imports. Without it `tsc` fails on files nobody touched.
- **`.env.local`** — the per-machine inbox token. Absent, Capture uploads fail at runtime with no compile-time signal at all.

**Run jest and metro from the worktree, never from the main checkout.** `modulePathIgnorePatterns` now keeps the main checkout's suite out of `.worktrees/`; before it was added, one worktree silently doubled the suite to 54 tests and five of the duplicates failed on haste collisions — output that reads as five regressions rather than as a misconfigured glob.
