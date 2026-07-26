import { uploadToInbox } from '../src/lib/upload';

const readBlob = async () => new Blob(['x']);

describe('uploadToInbox', () => {
  it('sends ISO 8601 X-Recorded and an extensioned X-Filename', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });

    await uploadToInbox({
      uri: 'file:///tmp/memo.m4a',
      filename: 'memo.m4a',
      recordedAt: new Date('2026-07-26T13:50:00Z'),
      token: 'secret',
      fetcher: fetcher as unknown as typeof fetch,
      readBlob,
    });

    const init = fetcher.mock.calls[0][1];
    expect(init.headers['X-Recorded']).toBe('2026-07-26T13:50:00.000Z');
    expect(init.headers['X-Filename']).toBe('memo.m4a');
    expect(init.headers['Authorization']).toBe('Bearer secret');
    expect(init.method).toBe('POST');
  });

  it('refuses an extensionless filename rather than uploading a file the intake will skip', async () => {
    const fetcher = jest.fn();
    await expect(
      uploadToInbox({
        uri: 'file:///tmp/memo',
        filename: 'memo',
        recordedAt: new Date(),
        token: 'secret',
        fetcher: fetcher as unknown as typeof fetch,
        readBlob,
      }),
    ).rejects.toThrow(/extension/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses when no token is configured', async () => {
    const fetcher = jest.fn();
    await expect(
      uploadToInbox({
        uri: 'file:///tmp/memo.m4a',
        filename: 'memo.m4a',
        recordedAt: new Date(),
        token: '',
        fetcher: fetcher as unknown as typeof fetch,
        readBlob,
      }),
    ).rejects.toThrow(/token/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces a rejection from the endpoint', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'bad token' });

    await expect(
      uploadToInbox({
        uri: 'file:///tmp/memo.m4a',
        filename: 'memo.m4a',
        recordedAt: new Date(),
        token: 'wrong',
        fetcher: fetcher as unknown as typeof fetch,
        readBlob,
      }),
    ).rejects.toThrow(/401/);
  });
});
