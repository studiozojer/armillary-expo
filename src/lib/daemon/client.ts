import { DAEMON_BASE_URL } from '../config';
import {
  DaemonError,
  type ChangedFile,
  type Commit,
  type Composition,
  type FileResponse,
  type HealthResponse,
  type RepoState,
  type ReposResponse,
  type TreeResponse,
  type VoicenoteIndex,
} from './types';

/**
 * Typed client for the engine's routes — reads plus the per-repo git verbs.
 *
 * `fetch` is injected rather than imported so tests exercise the client instead
 * of the network.
 */
export class DaemonClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(baseUrl: string = DAEMON_BASE_URL, fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { signal });
    if (!response.ok) {
      // The status is what the UI branches on — a 415 on a .png should read as
      // "can't open this file type", not as a generic failure.
      throw new DaemonError(response.status, await response.text());
    }
    return (await response.json()) as T;
  }

  /**
   * The per-repo git verbs are POSTs with no body — the name is in the path
   * and there is nothing else to say. A 403 here is meaningful rather than
   * generic: the host has not granted the `sync` or `push` gate, and the
   * screen hides the action rather than showing an error.
   */
  private async post<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { method: 'POST', signal });
    if (!response.ok) {
      throw new DaemonError(response.status, await response.text());
    }
    return (await response.json()) as T;
  }

  getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health', signal);
  }

  getComposition(signal?: AbortSignal): Promise<Composition> {
    return this.get<Composition>('/composition', signal);
  }

  getTree(path: string, signal?: AbortSignal): Promise<TreeResponse> {
    return this.get<TreeResponse>(`/tree?path=${encodeURIComponent(path)}`, signal);
  }

  getFile(path: string, signal?: AbortSignal): Promise<FileResponse> {
    return this.get<FileResponse>(`/file?path=${encodeURIComponent(path)}`, signal);
  }

  getVoicenotes(signal?: AbortSignal): Promise<VoicenoteIndex> {
    return this.get<VoicenoteIndex>('/voicenotes', signal);
  }

  /** Every repo the workspace composes, plus the gates governing what can be done to them. */
  getRepos(signal?: AbortSignal): Promise<ReposResponse> {
    return this.get<ReposResponse>('/repos', signal);
  }

  /**
   * A name is a key into the engine's manifest, not a filesystem path — but it
   * still goes through `encodeURIComponent`. The engine 404s a miss without
   * ever constructing a path from it, so this is defence in depth rather than
   * the only guard: a name containing a slash must not silently address a
   * different route.
   */
  getRepo(name: string, signal?: AbortSignal): Promise<RepoState> {
    return this.get<RepoState>(`/repos/${encodeURIComponent(name)}`, signal);
  }

  getLog(name: string, limit?: number, signal?: AbortSignal): Promise<Commit[]> {
    const query = limit === undefined ? '' : `?limit=${limit}`;
    return this.get<Commit[]>(`/repos/${encodeURIComponent(name)}/log${query}`, signal);
  }

  getChanges(name: string, signal?: AbortSignal): Promise<ChangedFile[]> {
    return this.get<ChangedFile[]>(`/repos/${encodeURIComponent(name)}/changes`, signal);
  }

  /**
   * Every mutation below returns the repo's new state rather than an ack, so
   * a caller never has to re-read after acting on it — and a refused action
   * (dirty tree, diverged history…) still comes back as a 200 carrying
   * `action_error`, not as a thrown `DaemonError`. A `DaemonError` here means
   * the request itself failed (403 ungated, 404 unknown name), not that git
   * declined.
   */
  fetchRepo(name: string, signal?: AbortSignal): Promise<RepoState> {
    return this.post<RepoState>(`/repos/${encodeURIComponent(name)}/fetch`, signal);
  }

  pullRepo(name: string, signal?: AbortSignal): Promise<RepoState> {
    return this.post<RepoState>(`/repos/${encodeURIComponent(name)}/pull`, signal);
  }

  pushRepo(name: string, signal?: AbortSignal): Promise<RepoState> {
    return this.post<RepoState>(`/repos/${encodeURIComponent(name)}/push`, signal);
  }

  /** Fetches every composed repo in one round trip; returns each repo's new state. */
  fetchAll(signal?: AbortSignal): Promise<RepoState[]> {
    return this.post<RepoState[]>('/repos/fetch', signal);
  }
}
