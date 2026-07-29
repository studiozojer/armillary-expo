import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CircleButton } from '../src/components/ui';
import { themeFor } from '../src/theme';

describe('<CircleButton>', () => {
  it('is a labelled button that fires', async () => {
    const onPress = jest.fn();
    await render(<CircleButton icon="settings" accessibilityLabel="Settings" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a circle on the card surface', async () => {
    const theme = themeFor('light');
    await render(<CircleButton testID="cb" icon="settings" accessibilityLabel="Settings" onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByTestId('cb').props.style) as Record<string, unknown>;
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    expect(style.borderRadius).toBe(theme.radius.full);
    expect(style.backgroundColor).toBe(theme.color.bgSolidCard);
  });

  it('disabled: announces the state and does not fire', async () => {
    const onPress = jest.fn();
    await render(
      <CircleButton testID="cb" icon="more" accessibilityLabel="More" onPress={onPress} disabled />,
    );
    const button = screen.getByTestId('cb');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a stub with no handler is still announced disabled', async () => {
    // The stubs this pass ships (search, more, filter) have no behavior at all;
    // rendering them enabled-looking but inert would be a lie in both directions.
    await render(<CircleButton testID="cb" icon="search" accessibilityLabel="Search" disabled />);
    expect(screen.getByTestId('cb').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
