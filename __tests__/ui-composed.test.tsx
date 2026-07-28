import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button, Callout, Card, ROW_ICON_LANE, Rule, SectionHeader } from '../src/components/ui';
import { themeFor } from '../src/theme';

const theme = themeFor('light');

// @testing-library/react-native v14 made `render` async and moved the queries
// onto `screen`. The pre-v14 `const { … } = render(...)` shape throws here — see
// __tests__/markdown-view.test.tsx and __tests__/ui-text.test.tsx.

// Card composes Box, which passes an array so a caller override wins. Flatten
// before asserting; see __tests__/ui-layout.test.tsx for the same note.
const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe('composed components', () => {
  it('draws a hairline rule, inset when asked', async () => {
    await render(<Rule testID="r" inset={ROW_ICON_LANE} />);
    expect(styleOf(screen.getByTestId('r'))).toMatchObject({
      height: theme.border.hairline,
      marginLeft: ROW_ICON_LANE,
      backgroundColor: theme.color.bdCard,
    });
  });

  it('paints a Card with the opaque card surface, never an overlay', async () => {
    await render(<Card testID="c" />);
    expect(styleOf(screen.getByTestId('c'))).toMatchObject({
      backgroundColor: theme.color.bgSolidCard,
    });
  });

  it('sets section headers in mono, uppercased', async () => {
    await render(<SectionHeader>operators</SectionHeader>);
    const node = screen.getByText('OPERATORS');
    // Text always passes style={[computed, style]} (see styleOf comment above);
    // props.style is therefore an array here too, so this must flatten before
    // reading fontFamily off it — same fix as ui-text.test.tsx applies for the
    // identical shape. Deviation from the brief's verbatim snippet, flagged in
    // the task report.
    expect(styleOf(node).fontFamily).toMatch(/^PPFraktionMono/);
  });

  it('keeps the Callout body verbatim', async () => {
    await render(<Callout title="Not live yet">Fixture data.</Callout>);
    expect(screen.getByText('Not live yet')).toBeTruthy();
    expect(screen.getByText('Fixture data.')).toBeTruthy();
  });

  it('exposes a Button to assistive technology, disabled state included', async () => {
    // A Pressable is not announced as a button unless it says so, and a
    // disabled one that does not report its state reads as merely broken.
    await render(<Button label="Create" onPress={jest.fn()} disabled />);
    const button = screen.getByRole('button', { name: 'Create' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('presses a Button and refuses to when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Create" onPress={onPress} />);
    fireEvent.press(screen.getByText('Create'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(<Button label="Create" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Create'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
