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
      // Composed directly at the root — the commons, usually.
      if (text) out[head] = text;
      else out[head] = 'commons';
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
