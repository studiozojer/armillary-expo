export type Module = { name: string; path: string; repo?: string; note?: string };

export type Protocol = {
  name: string;
  source: string;
  /**
   * A union PLUS string, on purpose. C-5 declares the protocol interface
   * provisional and requires engines to tolerate unknown values; a closed union
   * would make this client stricter than the standard it is a client of.
   */
  load: 'boot' | 'on-demand' | 'session-end' | (string & {});
  when?: string;
  requires?: string[];
};

export type HashedFile = { path: string; sha256: string };

export type ProtocolSource = {
  name: string;
  path: string;
  present: boolean;
  sha256?: string;
};

export type Composition = {
  operators: Module[];
  commons: Module[];
  repos: Module[];
  protocols: Protocol[];
  manifests: HashedFile[];
  protocol_sources: ProtocolSource[];
};

export type TreeEntry = { name: string; dir: boolean };
export type TreeResponse = {
  path: string;
  entries: TreeEntry[];
  /** Entries the directory actually holds, before the engine's cap. */
  total: number;
  /** `entries` is a prefix of `total` — the UI must say so rather than imply completeness. */
  truncated: boolean;
};
export type FileResponse = { path: string; sha256: string; bytes: number; text: string };
export type HealthResponse = { ok: boolean; root: string; version: string };

/**
 * `GET /whoami`'s shape — what the presented token's own facts are, read
 * back from the engine rather than assumed client-side. `grants` is a plain
 * string array on the wire (the same `sync`/`push`/`commit` vocabulary
 * `ReposResponse`'s three booleans name individually) rather than a closed
 * union, because the engine — not this client — owns the grant vocabulary,
 * and a closed union here would make an unrecognized grant a parse failure
 * instead of a chip this screen simply doesn't have special styling for.
 */
export type WhoamiResponse = { name: string; grants: string[]; minted: string };

export class DaemonError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DaemonError';
    this.status = status;
  }
}

export type VoicenoteState = 'transcribed' | 'untranscribed' | 'audio_absent';

export type VoicenoteTranscript = {
  path: string;
  title?: string;
  recorded?: string;
  duration_min?: string;
  transcribed_by?: string;
  model?: string;
};

export type VoicenoteEntry = {
  audio: string;
  /** Absent when the audio is not on this machine. */
  bytes?: number;
  state: VoicenoteState;
  transcript?: VoicenoteTranscript;
};

export type VoicenoteIndex = {
  audio_root: string;
  /** Where the engine looked — so an empty result can say where. */
  transcript_roots: string[];
  entries: VoicenoteEntry[];
};

/**
 * A repo's relationship to its upstream. A union rather than a status string
 * plus optional fields: `ahead`/`behind`/`upstream` only ever coexist under
 * `tracking`, so a type that let them float free of each other could
 * represent states (e.g. `behind` with no `upstream`) the engine never sends.
 */
export type Position =
  | { kind: 'tracking'; upstream: string; ahead: number; behind: number }
  | { kind: 'upstream-gone'; upstream: string }
  | { kind: 'no-upstream' }
  | { kind: 'detached' };

/**
 * What `kind` a failed action reports. Closed vocabulary — the engine never
 * sends anything else, and code branches on this rather than on `message`,
 * which is display-only.
 */
export type ActionErrorKind =
  | 'dirty' // refused: the working tree has uncommitted changes
  | 'not-fast-forwardable' // refused: history diverged
  | 'refused-by-remote' // the remote deliberately declined (protected branch, pre-receive hook)
  | 'transport' // could not reach the remote
  | 'timeout'
  | 'nothing-to-commit' // refused: a commit was attempted with nothing staged/dirty on the host
  | 'detached' // refused: HEAD is not on a branch, so there is nothing for a commit to land on
  | 'commit-failed' // the host declined the commit for a reason not covered above
  | 'merge-conflict'; // a merge was attempted during pull and git refused (conflict)

export type ActionError = { kind: ActionErrorKind; message: string };

export type RepoState = {
  name: string;
  path: string;
  head?: string;
  branch?: string;
  position: Position;
  dirty_files: number;
  last_fetch?: string;
  /** Single-repo routes only. Always absent from `GET /repos`. */
  newest_commit?: string;
  worktrees: number;
  submodules: boolean;
  /**
   * The last action this request performed failed. Present on a 200 — a
   * failed verb is a populated state, not an HTTP error.
   */
  action_error?: ActionError;
  /**
   * The repo could not be read at all. When set, `head`/`branch`/`position`/
   * `dirty_files` are type defaults rather than measurements — branch on this
   * before rendering anything else. `last_fetch`, `worktrees` and
   * `submodules` ARE real measurements even here.
   */
  read_error?: string;
};

export type ReposResponse = {
  /** The `sync` grant — fetch and pull. */
  enabled: boolean;
  /** The `push` grant — separate on purpose. */
  push_enabled: boolean;
  /** The `commit` grant — authorship, separate from both. */
  commit_enabled: boolean;
  repos: RepoState[];
  /**
   * Repo-relative paths of git checkouts on disk that no manifest declares —
   * surfaced so a stray clone is visible, but never swept. Plain strings on
   * the wire: the engine serializes `Vec<String>`, not a wrapper struct — the
   * `NotComposed` struct that once backed this field died with `sync.rs`, and
   * the object shape survived here only because it was inherited from the
   * retired sync report rather than checked against the new route.
   */
  not_composed: string[];
};

export type Commit = {
  sha: string;
  subject: string;
  author: string;
  date: string;
  /** Not yet on the upstream ref. */
  unpushed: boolean;
};

export type ChangedFile = { path: string; change: string; staged: boolean };

export type ModelEntry = {
  id: string;
  label: string | null;
  /** `choose_provider`'s answer on the engine — the app never re-derives the prefix rule. */
  provider: 'anthropic' | 'zen';
  /**
   * Whether the engine holds a key for this model's provider. **Advisory** —
   * the engine accepts a create for an unusable model and fails the first
   * turn with `no_api_key`. The picker greys the row out; it does not block.
   */
  usable: boolean;
};

/** `default` is null on a host with no `models.toml` — a 200 with an empty catalog, not an error. */
export type ModelCatalog = {
  default: string | null;
  models: ModelEntry[];
};
