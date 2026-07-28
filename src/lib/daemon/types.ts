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
