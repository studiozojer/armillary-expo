import { act, render, screen } from '@testing-library/react-native';
import { useCallback, useEffect } from 'react';
import { Text } from 'react-native';

import { PanelHost } from '../src/components/panel-host';
import { PanelProvider, usePanel, usePanelContent } from '../src/lib/panel-context';

/** A screen that puts something in the panel for as long as it is mounted. */
function ScreenWithPanel({ label = 'panel body' }: { label?: string }) {
  const render = useCallback(() => <Text>{label}</Text>, [label]);
  usePanelContent(render);
  return <Text>screen</Text>;
}

/** A screen that registers nothing — the Explorer's case. */
function ScreenWithoutPanel() {
  return <Text>screen</Text>;
}

/** Opens the panel on mount, standing in for the header button. */
function AutoOpen() {
  const { setOpen } = usePanel();
  useEffect(() => setOpen(true), [setOpen]);
  return null;
}

function app(children: React.ReactNode) {
  return (
    <PanelProvider>
      <PanelHost>{children}</PanelHost>
    </PanelProvider>
  );
}

describe('PanelHost', () => {
  it('renders the registered screen content when open', async () => {
    await render(
      app(
        <>
          <ScreenWithPanel />
          <AutoOpen />
        </>,
      ),
    );
    expect(screen.getByText('panel body')).toBeTruthy();
  });

  it('holds the content out of the tree while closed', async () => {
    await render(app(<ScreenWithPanel />));
    expect(screen.getByText('screen')).toBeTruthy();
    expect(screen.queryByText('panel body')).toBeNull();
  });

  /**
   * The scoping policy, and the reason the hoist needed a context at all.
   *
   * The drawer has to sit above the Stack to cover the header, which makes it
   * global — so every screen would have one. A screen that registers nothing
   * must therefore be unable to open it, or the Explorer grows a blank panel
   * you can drag out by accident.
   */
  it('cannot be swiped open on a screen that registers nothing', async () => {
    await render(app(<ScreenWithoutPanel />));
    expect(screen.getByLabelText('swipe:off')).toBeTruthy();
  });

  it('can be swiped open once a screen registers content', async () => {
    await render(app(<ScreenWithPanel />));
    expect(screen.getByLabelText('swipe:on')).toBeTruthy();
  });

  // Leaving the screen takes its panel with it — otherwise the next screen
  // inherits a panel describing an instance you have navigated away from.
  it('drops the content and closes when the screen unmounts', async () => {
    const { rerender } = await render(
      app(
        <>
          <ScreenWithPanel />
          <AutoOpen />
        </>,
      ),
    );
    expect(screen.getByText('panel body')).toBeTruthy();

    await act(async () => {
      rerender(app(<ScreenWithoutPanel />));
    });

    expect(screen.queryByText('panel body')).toBeNull();
    expect(screen.getByLabelText('swipe:off')).toBeTruthy();
  });

  // A re-registration clears and re-sets content in the same commit. Closing on
  // the clear rather than on a settled null would slam the drawer shut every
  // time the screen re-rendered — which, for the chat, is every streamed token.
  it('stays open across a re-registration', async () => {
    const { rerender } = await render(
      app(
        <>
          <ScreenWithPanel label="first" />
          <AutoOpen />
        </>,
      ),
    );
    expect(screen.getByText('first')).toBeTruthy();

    await act(async () => {
      rerender(
        app(
          <>
            <ScreenWithPanel label="second" />
            <AutoOpen />
          </>,
        ),
      );
    });

    expect(screen.getByText('second')).toBeTruthy();
  });
});

describe('usePanel outside a provider', () => {
  /**
   * Every screen test in this repo renders its screen standalone, with no root
   * layout. The hook degrades to inert rather than throwing so those suites
   * fail for their own reasons and not for this one — the same posture as the
   * safe-area mock. This pins that as a decision rather than an accident.
   */
  it('is inert rather than throwing', async () => {
    // Awaited directly: an un-awaited `expect(async …).not.toThrow()` passes
    // without the render ever running, which is a green test asserting nothing.
    await render(<ScreenWithPanel />);
    expect(screen.getByText('screen')).toBeTruthy();
  });
});
