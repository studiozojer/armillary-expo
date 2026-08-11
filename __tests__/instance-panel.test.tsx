import { fireEvent, render, screen } from '@testing-library/react-native';

import { InstancePanel, splitModel } from '../src/components/instance-panel';
import { CardRow } from '../src/components/ui';
import type { Instance } from '../src/lib/session/events';

function instance(over: Partial<Instance> = {}): Instance {
  return {
    id: 'e4f1a9c2-0b77-4d31-9a55-1c2d3e4f5a6b',
    operator: 'tycho',
    stream: 'workspace',
    startedAt: '2026-08-11T09:00:00Z',
    lastSeq: 412,
    model: 'zen/deepseek-v4-flash',
    ...over,
  };
}

describe('splitModel', () => {
  it('reads the provider off the slug prefix', () => {
    expect(splitModel('zen/deepseek-v4-flash')).toEqual({
      provider: 'zen',
      model: 'deepseek-v4-flash',
    });
  });

  // A bare slug is Anthropic's — the absence of a prefix IS the answer, which
  // is why there is no separate provider field to fetch.
  it('reports no provider for an unprefixed slug', () => {
    expect(splitModel('claude-opus-5')).toEqual({ provider: null, model: 'claude-opus-5' });
  });

  // The guard that matters: null means nothing was pinned and the engine's own
  // default pilots. The catalog is a host fact this client has never been told,
  // so naming a specific model here would be inventing a reading.
  it('does not guess what the engine default is', () => {
    const { model, provider } = splitModel(null);
    expect(model).toBe('engine default');
    expect(provider).toBeNull();
    expect(model).not.toMatch(/claude|zen|deepseek/i);
  });

  it('keeps a nested slug intact after the first slash', () => {
    expect(splitModel('zen/vendor/model-x')).toEqual({ provider: 'zen', model: 'vendor/model-x' });
  });
});

describe('<InstancePanel>', () => {
  it('shows the model and provider it actually has', async () => {
    await render(<InstancePanel instance={instance()} onDismiss={jest.fn()} />);

    expect(screen.getByText('deepseek-v4-flash')).toBeTruthy();
    expect(screen.getByText('zen')).toBeTruthy();
    expect(screen.getByText('workspace')).toBeTruthy();
    expect(screen.getByText('412')).toBeTruthy();
  });

  /**
   * The load-bearing test of this whole file.
   *
   * The drawing specifies `113.2k / 1m tokens`, `12% used` and `$2.11 spent`,
   * and none of those exist on the wire. A stub that renders a plausible number
   * is indistinguishable from a measured one, so this asserts the ABSENCE of
   * numerals in the shape those readings would take — if someone later wires a
   * placeholder to make the panel look finished, this fails.
   */
  it('renders no invented usage, percentage or cost figures', async () => {
    await render(<InstancePanel instance={instance()} onDismiss={jest.fn()} />);

    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.queryByText(/\d+(\.\d+)?k\s*\/\s*\d/)).toBeNull();
    // ...and says so out loud rather than showing an empty box.
    expect(screen.getByText(/not on the wire yet/i)).toBeTruthy();
  });

  it('dismisses from the header', async () => {
    const onDismiss = jest.fn();
    await render(<InstancePanel instance={instance()} onDismiss={onDismiss} />);

    fireEvent.press(screen.getByLabelText('Close instance panel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers Interrupt only while a turn is streaming', async () => {
    const onInterrupt = jest.fn();
    const { rerender } = await render(
      <InstancePanel instance={instance()} onDismiss={jest.fn()} onInterrupt={onInterrupt} />,
    );

    fireEvent.press(screen.getByTestId('panel-interrupt'));
    expect(onInterrupt).not.toHaveBeenCalled();

    await rerender(
      <InstancePanel
        instance={instance()}
        onDismiss={jest.fn()}
        onInterrupt={onInterrupt}
        canInterrupt
      />,
    );
    fireEvent.press(screen.getByTestId('panel-interrupt'));
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  // Archive's home is this panel, but it is being built on another branch.
  // Pinning it inert means whoever merges has to change this line deliberately
  // rather than discover the button was live and doing nothing.
  it('leaves Archive inert, awaiting feat/instance-archive', async () => {
    await render(<InstancePanel instance={instance()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('panel-archive').props.accessibilityState.disabled).toBe(true);
  });

  it('names the dispatcher when no operator is attached', async () => {
    await render(<InstancePanel instance={instance({ operator: null })} onDismiss={jest.fn()} />);
    expect(screen.getAllByText('dispatcher').length).toBeGreaterThan(0);
  });

  // The panel is reachable before attach() resolves, which is exactly when the
  // instance is null — it must render rather than throw.
  it('renders with no instance yet', async () => {
    await render(<InstancePanel instance={null} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('instance-panel')).toBeTruthy();
    expect(screen.getByText('engine default')).toBeTruthy();
  });
});

describe('<CardRow> secondary title', () => {
  it('renders the secondary beside the label', async () => {
    await render(<CardRow label="tycho" secondary="{{topic}}" note="workspace · seq 412" />);
    expect(screen.getByText('tycho')).toBeTruthy();
    expect(screen.getByText('{{topic}}')).toBeTruthy();
  });

  // One announcement per element: a screen-reader user gets no visual glance
  // that takes the title line's two halves in at once.
  it('folds every visible string into one announcement', async () => {
    await render(
      <CardRow label="tycho" secondary="{{topic}}" note="workspace" onPress={jest.fn()} />,
    );
    expect(screen.getByLabelText('tycho. {{topic}}. workspace')).toBeTruthy();
  });

  it('omits the secondary lane entirely when not given', async () => {
    await render(<CardRow label="tycho" note="workspace" />);
    expect(screen.queryByText('{{topic}}')).toBeNull();
    expect(screen.getByText('tycho')).toBeTruthy();
  });
});
