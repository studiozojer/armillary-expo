import type { Composition } from '@/lib/daemon/types';

/**
 * What the manifest knows about a top-level entry, keyed by its first path
 * segment.
 *
 * Deliberately thin. The filesystem is the view now; this only decorates it.
 * An entry the manifest does not name gets nothing, and that silence is the
 * information — `local/` and `operators/blank` are on disk and composed by
 * nothing, which is a fact the old three-section screen could not express at
 * all.
 */
export function annotationsFor(composition: Composition): Record<string, string> {
  const out: Record<string, string> = {};

  const slots: Record<string, number> = {};
  const note = (path: string, text: string | undefined) => {
    const [head, ...rest] = path.split('/');
    if (rest.length === 0) {
      // Composed directly at the root. No `else 'commons'` here: that
      // fallback was reachable from all three callers below, so an unnoted
      // root-level operator or repo — not just the commons — got labelled
      // "commons", inventing a fact the manifest never stated. The commons
      // call already supplies its own `?? 'commons'` default; everyone else
      // gets nothing, which is the honest answer when the manifest is silent.
      if (text) out[head] = text;
      return;
    }
    slots[head] = (slots[head] ?? 0) + 1;
  };

  composition.commons.forEach((m) => note(m.path, m.note ?? 'commons'));
  composition.operators.forEach((m) => note(m.path, m.note));
  composition.repos.forEach((m) => note(m.path, m.note));

  for (const [slot, count] of Object.entries(slots)) {
    out[slot] = `${count} composed`;
  }

  return out;
}
