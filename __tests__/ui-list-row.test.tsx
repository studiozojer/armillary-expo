import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { ICONS, ListRow } from '../src/components/ui';
import { themeFor } from '../src/theme';

// Shaped the way @testing-library/react-native's own internal
// buildResponderGrantEvent() builds one — see the note on the pressed-surface
// test below for why this, rather than fireEvent(row, 'pressIn'), is what
// actually drives Pressable's internal state transition.
function responderGrantEvent() {
  return {
    currentTarget: { measure: () => {} },
    target: {},
    preventDefault: () => {},
    isDefaultPrevented: () => false,
    stopPropagation: () => {},
    isPropagationStopped: () => false,
    persist: () => {},
    isPersistent: () => false,
    timeStamp: 0,
    nativeEvent: {
      changedTouches: [],
      identifier: 0,
      locationX: 0,
      locationY: 0,
      pageX: 0,
      pageY: 0,
      target: 0,
      timestamp: Date.now(),
      touches: [],
    },
  };
}

// toJSON()'s tree is the only stable way to reach the host SymbolView node's
// props — same approach ui-icon.test.tsx uses to inspect accessibility props.
type JsonNode = { type: string; props: Record<string, unknown>; children: JsonNode[] | null };

function findAllByType(node: JsonNode | null, type: string, out: JsonNode[] = []): JsonNode[] {
  if (!node) return out;
  if (node.type === type) out.push(node);
  for (const child of node.children ?? []) {
    findAllByType(child, type, out);
  }
  return out;
}

describe('<ListRow>', () => {
  it('renders a label and an optional note', async () => {
    await render(<ListRow icon="folder" label="tycho" />);
    expect(screen.getByText('tycho')).toBeTruthy();
    expect(screen.queryByText('journaling')).toBeNull();

    await screen.rerender(<ListRow icon="folder" label="tycho" note="journaling" />);
    expect(screen.getByText('journaling')).toBeTruthy();
  });

  it('announces as one control carrying both lines', async () => {
    // A sighted user takes in label and note at a glance; a screen-reader user
    // gets one announcement per element, so the note has to be folded in.
    await render(<ListRow icon="folder" label="tycho" note="journaling" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'tycho. journaling' })).toBeTruthy();
  });

  it('is not announced as a button when it does not press', async () => {
    await render(<ListRow icon="file" label="README.md" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    await render(<ListRow icon="file" label="README.md" onPress={onPress} />);
    fireEvent.press(screen.getByText('README.md'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses a real pressed surface rather than an opacity fade', async () => {
    // The whole app pressed rows with opacity: 0.6, which dims the text as well
    // as the surface and reads as "disabled" rather than "pressed".
    //
    // Pressable resolves its style function before handing it to the host View,
    // so props.style is already the RESTING object — you cannot call it to get
    // the pressed one. Drive the real state transition instead.
    //
    // A bare `fireEvent(row, 'pressIn')` does not do this: Pressable never
    // forwards a literal `onPressIn` prop down to its host View (nor up to its
    // own element props, unless the caller happens to pass one) — it only
    // exposes the raw touch-responder handlers (`onResponderGrant` etc.) that
    // `Pressability` itself listens on internally. So the host element that
    // fireEvent needs to hit is `onResponderGrant`, with a synthetic event
    // shaped the way `@testing-library/react-native`'s own internal
    // `buildResponderGrantEvent()` builds one (this is what `userEvent.press`
    // dispatches under the hood, verified against this repo's installed
    // react-native 0.86 / @testing-library/react-native 14 by tracing
    // Pressable.js and Pressability.js directly).
    const theme = themeFor('light');
    await render(
      <ListRow testID="row" icon="folder" label="kepler" onPress={jest.fn()} />,
    );
    const row = screen.getByTestId('row');

    const resting = StyleSheet.flatten(row.props.style) as Record<string, unknown>;
    expect(resting.backgroundColor).toBe(theme.color.bgSolidCard);

    await fireEvent(row, 'responderGrant', responderGrantEvent());
    const pressed = StyleSheet.flatten(screen.getByTestId('row').props.style) as Record<string, unknown>;

    expect(pressed.backgroundColor).toBe(theme.color.bgSolidCardPressed);
    expect(pressed.backgroundColor).not.toBe(resting.backgroundColor);
    expect(pressed.opacity).toBeUndefined();
  });

  it('does not paint a pressed surface when it has nothing to press', async () => {
    // Pressable wires full responder handlers onto every row regardless of
    // `onPress` — that's how `pressed` itself gets tracked — so a row with no
    // `onPress` still receives a real onResponderGrant. Without gating the
    // style on `onPress`, tapping a non-interactive row would visibly depress
    // it: a button-shaped affordance contradicting the accessibility tree,
    // which correctly carries no button role here (see the test above).
    const theme = themeFor('light');
    await render(<ListRow testID="row" icon="folder" label="kepler" />);
    const row = screen.getByTestId('row');

    const resting = StyleSheet.flatten(row.props.style) as Record<string, unknown>;
    expect(resting.backgroundColor).toBe(theme.color.bgSolidCard);

    await fireEvent(row, 'responderGrant', responderGrantEvent());
    const afterGrant = StyleSheet.flatten(screen.getByTestId('row').props.style) as Record<
      string,
      unknown
    >;

    expect(afterGrant.backgroundColor).toBe(theme.color.bgSolidCard);
    expect(afterGrant.backgroundColor).not.toBe(theme.color.bgSolidCardPressed);
  });

  it('renders the icon for its kind, not a fixed one', async () => {
    // A straight passthrough of `icon` to `Icon` is correct by inspection today,
    // but nothing else here pins it down: a future edit that hardcodes or
    // swaps the kind (always rendering folder, say) would ship green without
    // this. Task 10 rebuilds three call sites on ListRow and depends on it
    // rendering the right glyph per kind, so assert both directions — that
    // `file` renders the file symbol and does NOT render the folder one —
    // rather than only the positive case, which stops guarding the moment
    // both kinds render the same glyph.
    await render(<ListRow icon="file" label="README.md" />);
    const symbols = findAllByType(screen.toJSON() as JsonNode | null, 'ViewManagerAdapter_SymbolModule');

    // SymbolView resolves its per-platform `name` object down to the single
    // string for the current Platform.OS before it ever reaches the host node
    // (verified: this environment's host prop was the plain string "doc", not
    // the {ios, web, android} object Icon builds) — so compare against that
    // same per-platform resolution rather than assuming a shape.
    const platformName = (spec: { ios: string; web: string }) =>
      Platform.OS === 'ios' ? spec.ios : spec.web;

    // The leading icon is the first SymbolView in the tree; the chevron is the
    // (fixed, always-present) second one.
    const leadingIcon = symbols[0];
    expect(leadingIcon?.props.name).toBe(platformName(ICONS.file));
    expect(leadingIcon?.props.name).not.toBe(platformName(ICONS.folder));
  });
});
