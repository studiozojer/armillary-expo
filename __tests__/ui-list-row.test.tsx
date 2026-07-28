import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ListRow } from '../src/components/ui';
import { themeFor } from '../src/theme';

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

    const responderGrantEvent = {
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
    await fireEvent(row, 'responderGrant', responderGrantEvent);
    const pressed = StyleSheet.flatten(screen.getByTestId('row').props.style) as Record<string, unknown>;

    expect(pressed.backgroundColor).toBe(theme.color.bgSolidCardPressed);
    expect(pressed.backgroundColor).not.toBe(resting.backgroundColor);
    expect(pressed.opacity).toBeUndefined();
  });
});
