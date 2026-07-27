import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useLoader } from '../src/lib/use-loader';

/** Renders whatever the loader last resolved, so a stale write is visible. */
function Probe({ k, loader }: { k: string; loader: (s: AbortSignal) => Promise<string> }) {
  const { state } = useLoader<string>(k, loader);
  return <Text>{state.status === 'ok' ? state.data : state.status}</Text>;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useLoader', () => {
  it('a superseded slow response never overwrites the newer one', async () => {
    // The bug this exists for: you are on a slow host, switch to a fast one, the
    // fast one renders — and then the slow host's original response resolves and
    // silently replaces it. benatky's modules under a stjerneborg header.
    const slow = deferred<string>();
    const fast = deferred<string>();

    const loader = jest
      .fn<Promise<string>, [AbortSignal]>()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise);

    const view = await render(<Probe k="benatky" loader={loader} />);

    // Switch hosts before the first response lands.
    await act(async () => {
      view.rerender(<Probe k="stjerneborg" loader={loader} />);
    });

    await act(async () => {
      fast.resolve('stjerneborg modules');
    });
    expect(screen.getByText('stjerneborg modules')).toBeTruthy();

    // The abandoned request finally answers. It must be ignored.
    await act(async () => {
      slow.resolve('benatky modules');
    });
    expect(screen.getByText('stjerneborg modules')).toBeTruthy();
    expect(screen.queryByText('benatky modules')).toBeNull();
  });

  it('aborts the in-flight request when the key changes', async () => {
    const signals: AbortSignal[] = [];
    const loader = jest.fn(async (signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string>(() => {}); // never settles
    });

    const view = await render(<Probe k="a" loader={loader} />);
    await act(async () => {
      view.rerender(<Probe k="b" loader={loader} />);
    });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('a superseded rejection does not surface as an error', async () => {
    const stale = deferred<string>();
    const fresh = deferred<string>();
    const loader = jest
      .fn<Promise<string>, [AbortSignal]>()
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => fresh.promise);

    const view = await render(<Probe k="one" loader={loader} />);
    await act(async () => {
      view.rerender(<Probe k="two" loader={loader} />);
    });
    await act(async () => {
      fresh.resolve('good');
    });
    await act(async () => {
      stale.reject(new Error('the abandoned host finally failed'));
    });

    expect(screen.getByText('good')).toBeTruthy();
  });
});
