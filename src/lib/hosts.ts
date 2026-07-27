import AsyncStorage from '@react-native-async-storage/async-storage';

import { DAEMON_BASE_URL, INBOX_BASE_URL } from './config';

export type Host = {
  /** Stable key used for persistence. */
  id: string;
  /** What the machine is called — this is what the header shows. */
  label: string;
  daemonUrl: string;
  inboxUrl: string;
};

/**
 * Known machines, addressed by tailnet IP rather than MagicDNS name.
 *
 * Deliberate: a hostname adds a DNS resolution step that fails differently
 * depending on whether MagicDNS is up, and a name that resolves on one device
 * and not another is exactly the kind of ambiguity that cost a debugging round.
 * The IP either answers or it does not.
 */
export const KNOWN_HOSTS: Host[] = [
  {
    id: 'benatky',
    label: 'benatky',
    daemonUrl: 'http://100.84.152.119:7778',
    inboxUrl: 'http://100.84.152.119:7777',
  },
  {
    id: 'stjerneborg',
    label: 'stjerneborg',
    daemonUrl: 'http://100.125.8.21:7778',
    inboxUrl: 'http://100.125.8.21:7777',
  },
  {
    id: 'localhost',
    label: 'localhost (simulator)',
    daemonUrl: 'http://127.0.0.1:7778',
    inboxUrl: 'http://127.0.0.1:7777',
  },
];

/** Falls back to whatever the build was configured with. */
export const FALLBACK_HOST: Host = {
  id: 'configured',
  label: 'configured default',
  daemonUrl: DAEMON_BASE_URL,
  inboxUrl: INBOX_BASE_URL,
};

const STORAGE_KEY = 'armillary.selectedHostId';

export async function loadSelectedHost(): Promise<Host> {
  try {
    const id = await AsyncStorage.getItem(STORAGE_KEY);
    return KNOWN_HOSTS.find((h) => h.id === id) ?? KNOWN_HOSTS[0];
  } catch {
    return KNOWN_HOSTS[0];
  }
}

export async function saveSelectedHost(host: Host): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, host.id);
}

export type Reachability =
  | { state: 'unknown' }
  | { state: 'checking' }
  | { state: 'up'; root: string; version: string }
  | { state: 'down'; reason: string };

/**
 * Ask a host what workspace it is serving.
 *
 * Returns the `root` rather than a bare boolean, because "which armillary am I
 * looking at" is the question worth answering when two machines both have one —
 * a green dot would not distinguish them.
 */
export async function probe(host: Host, timeoutMs = 4000): Promise<Reachability> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${host.daemonUrl}/health`, { signal: controller.signal });
    if (!response.ok) return { state: 'down', reason: `HTTP ${response.status}` };
    const body = (await response.json()) as { root?: string; version?: string };
    return { state: 'up', root: body.root ?? '(unknown root)', version: body.version ?? '?' };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      state: 'down',
      // The ATS refusal is indistinguishable from a network failure unless it is
      // named, and it cost a full debugging round precisely because the message
      // never reached the screen.
      reason: /transport security|insecure|cleartext/i.test(reason)
        ? 'blocked by App Transport Security (cleartext HTTP refused by iOS)'
        : reason,
    };
  } finally {
    clearTimeout(timer);
  }
}
