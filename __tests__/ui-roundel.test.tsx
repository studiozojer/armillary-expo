import { render, screen } from '@testing-library/react-native';

import { Roundel, roundelGlyph } from '../src/components/ui';

describe('roundelGlyph', () => {
  it('derives the first character, lowercased', () => {
    expect(roundelGlyph('tycho')).toBe('t');
    expect(roundelGlyph('Kepler')).toBe('k');
    expect(roundelGlyph('dispatcher')).toBe('d');
  });

  it('never returns an empty glyph', () => {
    expect(roundelGlyph('')).toBe('·');
    expect(roundelGlyph('   ')).toBe('·');
  });
});

describe('<Roundel>', () => {
  it('renders the derived glyph', async () => {
    await render(<Roundel name="tycho" />);
    expect(screen.getByText('t', { includeHiddenElements: true })).toBeTruthy();
  });

  it('is decorative: hidden from assistive technology', async () => {
    // The row that contains a roundel carries the operator name as its label;
    // the roundel repeating one letter of it would be announcement noise.
    await render(<Roundel testID="r" name="tycho" />);
    expect(
      screen.getByTestId('r', { includeHiddenElements: true }).props.accessibilityElementsHidden,
    ).toBe(true);
  });
});
