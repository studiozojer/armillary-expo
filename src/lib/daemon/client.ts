import { DAEMON_BASE_URL } from '../config';
import {
  DaemonError,
  type Composition,
  type FileResponse,
  type HealthResponse,
  type TreeResponse,
} from './types';

/**
 * Typed reads over the engine's four routes.
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

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`);
    if (!response.ok) {
      // The status is what the UI branches on — a 415 on a .png should read as
      // "can't open this file type", not as a generic failure.
      throw new DaemonError(response.status, await response.text());
    }
    return (await response.json()) as T;
  }

  getHealth(): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health');
  }

  getComposition(): Promise<Composition> {
    return this.get<Composition>('/composition');
  }

  getTree(path: string): Promise<TreeResponse> {
    return this.get<TreeResponse>(`/tree?path=${encodeURIComponent(path)}`);
  }

  getFile(path: string): Promise<FileResponse> {
    return this.get<FileResponse>(`/file?path=${encodeURIComponent(path)}`);
  }
}
