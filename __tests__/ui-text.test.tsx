import { render, screen } from '@testing-library/react-native';

import { Text } from '../src/components/ui/text';
import { themeFor } from '../src/theme';

// NOTE: @testing-library/react-native v14 made `render` async and moved the
// queries onto `screen`. `const { getByText } = render(...)` — the shape the
// task brief's example uses — silently yields undefined here (see
// __tests__/markdown-view.test.tsx for the same note).

describe('<Text>', () => {
  it('defaults to body in the primary text role', async () => {
    await render(<Text>tycho</Text>);
    const style = screen.getByText('tycho').props.style;
    expect(style).toMatchObject({
      fontSize: themeFor('light').type.body.fontSize,
      fontFamily: themeFor('light').type.body.fontFamily,
    });
  });

  it('binds a variant and a colour role together', async () => {
    await render(
      <Text variant="monoLabel" color="txTertiary">
        OPERATORS
      </Text>,
    );
    const style = screen.getByText('OPERATORS').props.style;
    expect(style.fontFamily).toMatch(/^PPFraktionMono/);
    expect(style.color).toBe(themeFor('light').color.txTertiary);
    expect(style.letterSpacing).toBeGreaterThan(0);
  });

  it('lets a caller override without losing the variant', async () => {
    await render(<Text style={{ opacity: 0.5 }}>note</Text>);
    const style = screen.getByText('note').props.style;
    expect(style.opacity).toBe(0.5);
    expect(style.fontSize).toBe(themeFor('light').type.body.fontSize);
  });
});
