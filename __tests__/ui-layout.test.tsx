import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Box, Inline, Screen, Stack } from '../src/components/ui';
import { themeFor } from '../src/theme';

const theme = themeFor('light');

// @testing-library/react-native v14 made `render` async and moved the queries
// onto `screen`. The pre-v14 `const { … } = render(...)` shape throws here — see
// __tests__/markdown-view.test.tsx and __tests__/ui-text.test.tsx.

// These components pass `style={[computed, style]}` so a caller override wins.
// props.style is therefore an ARRAY, and toMatchObject against an object fails
// on it — flatten first. Reading props.style directly is the obvious guess and
// it does not work.
const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe('layout primitives', () => {
  it('resolves Box props through the token scales', async () => {
    await render(<Box testID="b" p="lg" bg="bgSolidCard" radius="md" />);
    expect(styleOf(screen.getByTestId('b'))).toMatchObject({
      padding: theme.space.lg,
      backgroundColor: theme.color.bgSolidCard,
      borderRadius: theme.radius.md,
    });
  });

  it('lets the axis-specific paddings win over the general one', async () => {
    await render(<Box testID="b" p="sm" px="xl" />);
    expect(styleOf(screen.getByTestId('b'))).toMatchObject({
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.xl,
    });
  });

  it('stacks vertically and inlines horizontally, both with token gaps', async () => {
    await render(
      <>
        <Stack testID="s" gap="md" />
        <Inline testID="i" gap="xs" justify="space-between" />
      </>,
    );
    expect(styleOf(screen.getByTestId('s'))).toMatchObject({
      flexDirection: 'column',
      gap: theme.space.md,
    });
    expect(styleOf(screen.getByTestId('i'))).toMatchObject({
      flexDirection: 'row',
      gap: theme.space.xs,
      justifyContent: 'space-between',
    });
  });

  it('gives a Screen the page surface without being asked', async () => {
    // The default is the whole point. Every route wrote this by hand, and the
    // Explorer landing screen — which arrived by merge after the others were
    // converted — did not, so its opaque rows painted onto react-navigation's
    // stock grey. A screen that has to remember is a screen that will forget.
    await render(<Screen testID="s" />);
    expect(styleOf(screen.getByTestId('s'))).toMatchObject({
      flex: 1,
      backgroundColor: theme.color.bgSolidBase,
    });
  });

  it('lets a Screen take padding from the scale and a caller style last', async () => {
    await render(<Screen testID="s" p="lg" style={{ justifyContent: 'center' }} />);
    expect(styleOf(screen.getByTestId('s'))).toMatchObject({
      padding: theme.space.lg,
      justifyContent: 'center',
      backgroundColor: theme.color.bgSolidBase,
    });
  });
});
