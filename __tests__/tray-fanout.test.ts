import { fetchAllTrays, resolveTrayOpen, type Arrival } from '../src/lib/daemon/tray';
import type { Tray } from '../src/lib/daemon/types';
import type { Host } from '../src/lib/hosts';

const stjerneborg: Host = {
  id: 'stjerneborg',
  label: 'stjerneborg',
  daemonUrl: 'http://s:7778',
  inboxUrl: 'http://s:7777',
};
const delos: Host = { id: 'delos', label: 'delos', daemonUrl: 'http://d:7778', inboxUrl: 'http://d:7777' };

function entry(id: string, created_at: string, extra: Partial<Arrival> = {}) {
  return {
    id,
    sender: 'augur',
    kind: 'field',
    created_at,
    summary: id,
    path: `operators/augur/field/${id}.md`,
    ...extra,
  };
}

function trayOf(entries: ReturnType<typeof entry>[]): Tray {
  return { entries, skipped: 0 };
}

describe('fetching every known tray', () => {
  it('merges hosts newest first and tags each entry with the tray it came from', async () => {
    const clientFor = (h: Host) => ({
      getTray: async () =>
        h.id === 'stjerneborg'
          ? trayOf([entry('a', '2026-09-13T06:30:00-07:00'), entry('c', '2026-09-15T06:30:00-07:00')])
          : trayOf([entry('b', '2026-09-14T06:30:00-07:00')]),
    });

    const { entries, unreachable } = await fetchAllTrays([stjerneborg, delos], { clientFor });

    expect(entries.map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(entries.map((e) => e.hostId)).toEqual(['stjerneborg', 'delos', 'stjerneborg']);
    expect(entries[0].hostLabel).toBe('stjerneborg');
    expect(unreachable).toEqual([]);
  });

  /**
   * The load-bearing one. delos is a laptop; when it is asleep its tray is
   * absent, not the feed. A `Promise.all` here would have turned one sleeping
   * machine into an empty tab.
   */
  it('a host that rejects costs its own entries and nothing else', async () => {
    const clientFor = (h: Host) => ({
      getTray: async () => {
        if (h.id === 'delos') throw new Error('ECONNREFUSED');
        return trayOf([entry('a', '2026-09-14T06:30:00-07:00')]);
      },
    });

    const { entries, unreachable } = await fetchAllTrays([stjerneborg, delos], { clientFor });

    expect(entries.map((e) => e.id)).toEqual(['a']);
    expect(unreachable.map((h) => h.id)).toEqual(['delos']);
  });

  it('a host that hangs is cut off by its own timeout', async () => {
    const clientFor = (h: Host) => ({
      getTray: (signal?: AbortSignal) =>
        new Promise<Tray>((resolve, reject) => {
          if (h.id === 'stjerneborg') {
            resolve(trayOf([entry('a', '2026-09-14T06:30:00-07:00')]));
            return;
          }
          // Never resolves on its own — only the abort ends it.
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    const { entries, unreachable } = await fetchAllTrays([stjerneborg, delos], {
      clientFor,
      timeoutMs: 10,
    });

    expect(entries.map((e) => e.id)).toEqual(['a']);
    expect(unreachable.map((h) => h.id)).toEqual(['delos']);
  });

  it('no hosts is an empty feed', async () => {
    expect(await fetchAllTrays([], { clientFor: () => ({ getTray: async () => trayOf([]) }) })).toEqual({
      entries: [],
      unreachable: [],
    });
  });
});

describe('opening an arrival', () => {
  const arrival: Arrival = {
    ...entry('2026-09-14', '2026-09-14T06:30:00-07:00', { host: 'stjerneborg' }),
    hostId: 'stjerneborg',
    hostLabel: 'stjerneborg',
  };

  it('opens the artifact on the machine the ringer named, switching if needed', () => {
    expect(resolveTrayOpen({ entry: arrival, currentHostId: 'benatky' })).toEqual({
      href: '/browse/operators/augur/field/2026-09-14.md',
      switchToHostId: 'stjerneborg',
    });
  });

  it('does not switch when already there', () => {
    expect(resolveTrayOpen({ entry: arrival, currentHostId: 'stjerneborg' }).switchToHostId).toBeUndefined();
  });

  /**
   * A ringer that names no host, or one this build has never heard of, opens
   * against the tray the entry was READ from — the machine that certainly has
   * the file, because the ringer wrote both — never against some other host
   * the way a first-in-list fallback would.
   */
  it('falls back to the tray the entry was read from, not to an arbitrary host', () => {
    const unnamed = { ...arrival, host: undefined, hostId: 'delos', hostLabel: 'delos' };
    expect(resolveTrayOpen({ entry: unnamed, currentHostId: 'benatky' }).switchToHostId).toBe('delos');
    const unknown = { ...arrival, host: 'uraniborg', hostId: 'delos', hostLabel: 'delos' };
    expect(resolveTrayOpen({ entry: unknown, currentHostId: 'benatky' }).switchToHostId).toBe('delos');
  });

  it('strips a leading slash so the href does not double up', () => {
    const slashed = { ...arrival, path: '/operators/augur/field/x.md' };
    expect(resolveTrayOpen({ entry: slashed, currentHostId: 'stjerneborg' }).href).toBe(
      '/browse/operators/augur/field/x.md',
    );
  });
});
