#!/usr/bin/env bash
# Isolated concurrent streams for armillary-expo — one branch, one worktree, one window.
#
# This repo is PATH-COUPLED, so a bare `git worktree add` produces a tree that
# fails typecheck three ways, one missing sibling at a time:
#
#   1. __tests__/session-envelope.test.ts imports the event schema by a RELATIVE
#      path that climbs out of the repo into ../../../repos/armillary-core. From
#      a worktree that climb lands somewhere else entirely.
#   2. expo-env.d.ts is generated and gitignored, and it is what declares the
#      CSS-module and global.css side-effect imports. Without it, tsc fails on
#      files nobody touched.
#   3. .env.local carries the per-machine inbox token. Absent, Capture uploads
#      fail at runtime with no compile-time signal at all.
#
# None of these is visible until something breaks, which is the argument for a
# script rather than a paragraph in a doc.
#
# Usage:  ./scripts/worktree.sh new <topic>
#         ./scripts/worktree.sh rm  <topic>

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cmd="${1:-}"
topic="${2:-}"

if [[ -z "$cmd" || -z "$topic" ]]; then
  echo "usage: $0 {new|rm} <topic>" >&2
  exit 2
fi

wt="$repo_root/.worktrees/$topic"

wire() {
  local target="$1"

  # The sibling climb, made to resolve — and note WHERE it lands. The import is
  # `../../../repos/armillary-core/...` from `__tests__/`, so from
  # `<repo>/.worktrees/<topic>/__tests__/` those three steps end at the REPO
  # ROOT, not inside the worktree. The symlink therefore lives in the main
  # checkout and serves every worktree at that depth. (Putting it inside the
  # worktree is the obvious guess and it does not work; this comment exists
  # because that guess cost a round trip.)
  mkdir -p "$repo_root/repos"
  ln -sfn "$repo_root/../armillary-core" "$repo_root/repos/armillary-core"

  for generated in expo-env.d.ts .env.local; do
    if [[ -f "$repo_root/$generated" ]]; then
      cp "$repo_root/$generated" "$target/$generated"
    else
      echo "warning: $repo_root/$generated is missing; the worktree will be missing it too" >&2
    fi
  done

  (cd "$target" && npm install)

  # Verify rather than assume. A worktree that typechecks is one whose wiring
  # actually resolved; anything less is a tree that looks ready and is not.
  (cd "$target" && npx tsc --noEmit)
  echo "worktree ready: $target"
}

case "$cmd" in
  new)
    git -C "$repo_root" worktree add "$wt" -b "feat/$topic"
    wire "$wt"
    ;;
  rm)
    git -C "$repo_root" worktree remove "$wt"
    # The branch is deliberately left behind: a merged branch is cheap to drop
    # later, an un-pushed one removed by reflex is not.
    echo "removed $wt — branch feat/$topic still exists"
    ;;
  *)
    echo "usage: $0 {new|rm} <topic>" >&2
    exit 2
    ;;
esac
