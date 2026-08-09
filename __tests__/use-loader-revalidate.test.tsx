import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useLoader } from '../src/lib/use-loader';

describe('useLoader.revalidate — silent, content-preserving (design D7)', () => {
  it('re-runs the load without ever setting `refreshing`, and swaps data in place', async () => {
    let payload = 'first';
    const loader = jest.fn(async () => payload);
    const { result } = await renderHook(() => useLoader<string>('k', loader));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ok', data: 'first' }));

    payload = 'second';
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.revalidate();
    });
    expect(ok).toBe(true);
    expect(result.current.state).toEqual({ status: 'ok', data: 'second' });
    expect(result.current.refreshing).toBe(false); // never flipped — no spinner
  });

  it('a failed revalidate keeps the stale content and resolves false — stale beats an error flash nobody asked for', async () => {
    let fail = false;
    const loader = jest.fn(async () => {
      if (fail) throw new Error('down');
      return 'good';
    });
    const { result } = await renderHook(() => useLoader<string>('k', loader));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ok', data: 'good' }));

    fail = true;
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.revalidate();
    });
    expect(ok).toBe(false);
    expect(result.current.state).toEqual({ status: 'ok', data: 'good' }); // untouched
  });

  it('refresh() keeps its existing loud behavior — a failure still becomes the error state', async () => {
    let fail = false;
    const loader = jest.fn(async () => {
      if (fail) throw new Error('down');
      return 'good';
    });
    const { result } = await renderHook(() => useLoader<string>('k', loader));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ok', data: 'good' }));

    fail = true;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toMatchObject({ status: 'error' });
  });
});
