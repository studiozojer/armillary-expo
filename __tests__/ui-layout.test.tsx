import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Box, Inline, Stack } from '../src/components/ui';
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
});
