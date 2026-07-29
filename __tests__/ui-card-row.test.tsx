import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CardRow, Text } from '../src/components/ui';
import { themeFor } from '../src/theme';

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
});
