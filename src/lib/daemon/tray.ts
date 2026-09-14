import type { Host } from '../hosts';
import { hostByName } from '../push-deep-link';

import { daemonClientFor } from './client';
import type { Tray, TrayEntry } from './types';

/**
 * An entry as the screen shows it: the engine's record plus which machine's
 * tray it was read from. `hostId` is the fan-out's fact, not the ringer's —
 * an entry's own `host` field says where the ARTIFACT lives, and the two are
 * the same machine today only because every ringer writes to its own tray.
 */
export type Arrival = TrayEntry & { hostId: string; hostLabel: string };

export type Arrivals = {
  entries: Arrival[];
  /** Hosts that did not answer in time. Named so the screen can say so. */
  unreachable: Host[];
};

/** Newest first; ties on id so the order is total and the list does not reshuffle. */
export function newestFirst(a: Arrival, b: Arrival): number {
  return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}

/**
 * Every known machine's tray, merged.
 *
 * Entries are per machine and never synced (design D3/D4), so the feed is
 * assembled here, not on any one engine. Settled, not raced: one host that is
 * asleep — delos is a laptop — must cost the feed that host's entries and
 * nothing else. Each request gets its own timeout because a host that is off
 * the tailnet does not refuse, it hangs.
 *
 * `clientFor` is injectable so tests exercise the merge, not the network.
 */
export async function fetchAllTrays(
  hosts: Host[],
  opts: {
    signal?: AbortSignal;
    timeoutMs?: number;
    clientFor?: (host: Host) => { getTray(signal?: AbortSignal): Promise<Tray> };
  } = {},
): Promise<Arrivals> {
  const timeoutMs = opts.timeoutMs ?? 2500;
  const clientFor = opts.clientFor ?? ((h: Host) => daemonClientFor(h.id, h.daemonUrl));

  const results = await Promise.allSettled(
    hosts.map(async (host) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // The caller's abort (a screen unmounting) must also stop this one.
      const onOuterAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onOuterAbort);
      try {
        const tray = await clientFor(host).getTray(controller.signal);
        return tray.entries.map((e) => ({ ...e, hostId: host.id, hostLabel: host.label }));
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
      }
    }),
  );

  const entries: Arrival[] = [];
  const unreachable: Host[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') entries.push(...r.value);
    else unreachable.push(hosts[i]);
  });
  entries.sort(newestFirst);
  return { entries, unreachable };
}

/**
 * What tapping an arrival does — the same decision the push deep link makes,
 * for the same reason: `path` is meaningless without the machine it lives on,
 * so the host switches first and the navigation follows.
 *
 * The artifact's machine is the entry's own `host` field when the ringer
 * named one this build knows; otherwise the tray it was read from, which is
 * the right machine for every ringer that writes to its own tray.
 */
export function resolveTrayOpen(args: {
  entry: Arrival;
  currentHostId: string;
}): { href: string; switchToHostId?: string } {
  const { entry, currentHostId } = args;
  const target = hostByName(entry.host)?.id ?? entry.hostId;
  return {
    href: `/browse/${entry.path.replace(/^\/+/, '')}`,
    switchToHostId: target !== currentHostId ? target : undefined,
  };
}
