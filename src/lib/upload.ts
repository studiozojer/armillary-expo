import { INBOX_BASE_URL } from './config';

export type UploadArgs = {
  uri: string;
  filename: string;
  recordedAt: Date;
  token: string;
  fetcher?: typeof fetch;
  readBlob?: (uri: string) => Promise<Blob>;
};

async function defaultReadBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return await response.blob();
}

/**
 * Send a file to the Python inbox endpoint (D8 — two ports in v0; the engine
 * has no write routes).
 *
 * Encodes both defects the iOS Shortcut carries rather than reproducing them,
 * because both fail *silently* on the automated path.
 */
export async function uploadToInbox({
  uri,
  filename,
  recordedAt,
  token,
  fetcher = fetch,
  readBlob = defaultReadBlob,
}: UploadArgs): Promise<void> {
  // voicenote-intake.sh globs *.{m4a,...}, so an extensionless name is *skipped,
  // not errored* — a no-op wearing the costume of an upload. Refuse up front
  // instead of producing one.
  if (!/\.[A-Za-z0-9]+$/.test(filename)) {
    throw new Error(`filename "${filename}" has no extension; the intake would skip it silently`);
  }
  if (!token) {
    throw new Error('no inbox token; set EXPO_PUBLIC_INBOX_TOKEN in .env.local');
  }

  const body = await readBlob(uri);
  const response = await fetcher(`${INBOX_BASE_URL}/inbox`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Filename': filename,
      // ISO 8601, never a localized display string — the Shortcut sends
      // "Jul 24, 2026 at 13:50" and the declared capture time is lost to a
      // fallback.
      'X-Recorded': recordedAt.toISOString(),
      'Content-Type': 'application/octet-stream',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`inbox rejected the upload: ${response.status} ${await response.text()}`);
  }
}
