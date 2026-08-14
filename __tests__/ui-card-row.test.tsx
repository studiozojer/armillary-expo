import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { CardRow, ICONS, Text } from '../src/components/ui';
import { InstanceCard } from '../src/components/instance-card';
import type { Instance } from '../src/lib/session/events';
import { themeFor } from '../src/theme';
import { families } from '../src/theme/fonts.gen';

// `InstanceCard` only needs `useRouter()` for its `onPress` — a real
// navigation tree is more than this guard needs, same reasoning as
// `instances-screen.test.tsx`'s router mock.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

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

describe('<CardRow>', () => {
  it('announces as one control carrying both lines', async () => {
    await render(<CardRow label="tycho" note="chat · seq 12" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'tycho. chat · seq 12' })).toBeTruthy();
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    await render(<CardRow label="tycho" onPress={onPress} />);
    fireEvent.press(screen.getByText('tycho'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a rounded card, not a full-bleed row', async () => {
    const theme = themeFor('light');
    await render(<CardRow testID="cr" label="tycho" onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByTestId('cr').props.style) as Record<string, unknown>;
    expect(style.borderRadius).toBe(theme.radius.lg);
    expect(style.backgroundColor).toBe(theme.color.bgSolidCard);
  });

  it('renders the leading slot when supplied', async () => {
    await render(<CardRow label="tycho" leading={<Text>◐</Text>} />);
    expect(screen.getByText('◐')).toBeTruthy();
  });

  it('fires onLongPress when held', async () => {
    const onLongPress = jest.fn();
    await render(<CardRow label="tycho" onPress={() => {}} onLongPress={onLongPress} testID="row" />);
    fireEvent(screen.getByTestId('row'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('is not announced as a button when it does not press', async () => {
    await render(<CardRow label="tycho" />);
    expect(screen.queryByRole('button')).toBeNull();
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
      <CardRow testID="row" label="kepler" onPress={jest.fn()} />,
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
    await render(<CardRow testID="row" label="kepler" />);
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

  describe('the trailing slot', () => {
    // Same per-platform resolution the icon test explains: SymbolView collapses
    // its {ios, web, android} name to a single string before the host node.
    const platformName = (spec: { ios: string; web: string }) =>
      Platform.OS === 'ios' ? spec.ios : spec.web;

    const symbolNames = () =>
      findAllByType(screen.toJSON() as JsonNode | null, 'ViewManagerAdapter_SymbolModule').map(
        (symbol) => symbol.props.name,
      );

    it('holds the chevron when the caller supplies nothing', async () => {
      await render(<CardRow label="tycho" />);
      expect(symbolNames()).toContain(platformName(ICONS.chevron));
    });

    it('replaces the chevron with what the caller supplies, rather than sitting beside it', async () => {
      // Replaces, not appends: if the trailing slot rendered both, a supplied
      // node and a default chevron, it would read as two separate affordances
      // on the same card. Assert the absence as well as the presence — a version
      // that rendered both would pass the positive half alone.
      await render(<CardRow label="tycho" trailing={<Text>●</Text>} />);
      expect(screen.getByText('●')).toBeTruthy();
      expect(symbolNames()).not.toContain(platformName(ICONS.chevron));
    });

    // Fix 9: this file's absence assertion above exercises `CardRow` directly
    // with a hand-supplied `trailing` — it says nothing about `InstanceCard`,
    // the actual caller on the Instances list, and nothing here would catch a
    // chevron reintroduced inside ITS trailing slot (e.g. a future edit that
    // drops the model caption and falls back to `trailing={undefined}`).
    // Pins the count at exactly zero, reusing the same `findAllByType` walk
    // `symbolNames()` above is built on.
    it('InstanceCard never falls back to the chevron — its trailing slot always names a model', async () => {
      const instance: Instance = {
        id: 'inst-1',
        operator: 'tycho',
        stream: 'inst-1',
        startedAt: new Date().toISOString(),
        lastSeq: 3,
        model: 'claude-sonnet-5',
        mayWriteComposition: false,
        archived: false,
      };
      await render(<InstanceCard instance={instance} now={Date.now()} />);

      const chevrons = findAllByType(screen.toJSON() as JsonNode | null, 'ViewManagerAdapter_SymbolModule')
        .map((symbol) => symbol.props.name)
        .filter((name) => name === platformName(ICONS.chevron));
      expect(chevrons).toHaveLength(0);
    });

    // `CardRow`'s `register` axis picks the note's face: `instrument` sets the
    // mono `fraktionXs`, `reading` sets `whyteXs`. The instance row reads as
    // prose — "3h ago" is a sentence fragment, not instrument data — so it
    // takes Whyte. Pinned because `register` is one word, easy to flip back by
    // accident, and invisible in any test that only asserts on the string.
    it("InstanceCard's note line is set in Whyte, not the mono instrument face", async () => {
      const instance: Instance = {
        id: 'inst-1',
        operator: 'tycho',
        stream: 'inst-1',
        startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        lastSeq: 3,
        model: 'claude-sonnet-5',
        mayWriteComposition: false,
        archived: false,
      };
      await render(<InstanceCard instance={instance} now={Date.now()} />);

      const style = StyleSheet.flatten(screen.getByText('3h ago').props.style) as {
        fontFamily?: string;
      };
      expect(style.fontFamily).toBe(families.whyte.book);
      expect(style.fontFamily).not.toBe(families.fraktion.book);
    });
  });
});
