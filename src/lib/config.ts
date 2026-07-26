/**
 * Where the engine and the inbox live.
 *
 * Two ports on purpose (D8): the Rust engine serves reads on 7778, and the
 * existing Python inbox endpoint keeps `POST /inbox` on 7777. Absorbing the
 * inbox into the engine is later work with no v0 payoff.
 *
 * Overridable per-machine via EXPO_PUBLIC_* so a simulator can point at a
 * locally-running engine without editing source.
 */
export const DAEMON_BASE_URL =
  process.env.EXPO_PUBLIC_DAEMON_URL ?? 'http://stjerneborg:7778';

export const INBOX_BASE_URL = process.env.EXPO_PUBLIC_INBOX_URL ?? 'http://stjerneborg:7777';
