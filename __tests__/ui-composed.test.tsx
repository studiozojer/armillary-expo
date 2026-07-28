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

// WCAG 2.x relative luminance, from sRGB channels in [0, 255].
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const linearize = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function parseHex8(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1,
  };
}

/**
 * WCAG contrast ratio between a (possibly translucent) foreground colour and
 * an opaque background it sits on, computed from the actual token strings —
 * not a hardcoded pair — so a future role swap that looks fine in isolation
 * but reads badly once composited (as tx/primary did on bg/solid/button,
 * ~1.2:1 in dark mode) fails here instead of only showing up on a device.
 */
function contrastRatio(fgHex: string, bgHex: string): number {
  const fg = parseHex8(fgHex);
  const bg = parseHex8(bgHex);
  const composited = {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
  const lFg = relativeLuminance(composited);
  const lBg = relativeLuminance(bg);
  const [lighter, darker] = lFg > lBg ? [lFg, lBg] : [lBg, lFg];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Button primary fill/label contrast (WCAG AA, computed from theme tokens)', () => {
  it.each(['light', 'dark'] as const)('tx/button on bg/solid/button reads >= 4.5:1 in %s', (scheme) => {
    const t = themeFor(scheme);
    expect(contrastRatio(t.color.txButton, t.color.bgSolidButton)).toBeGreaterThanOrEqual(4.5);
  });

  // The test above proves the TOKEN PAIR is sound — it says nothing about
  // whether Button actually uses that pair. Revert button.tsx's primary
  // label from 'txButton' back to 'txPrimary' (the exact bug this file's
  // history fixed) and the assertion above still passes untouched, because
  // it never renders a <Button>. This one closes that gap by rendering the
  // real component and reading the real resolved colour off the real label.
  // Both tests are needed; neither subsumes the other — do not delete either
  // one as "redundant" with the other.
  it('wires the primary label to tx/button, not tx/primary', async () => {
    await render(<Button label="Create" onPress={jest.fn()} />);
    const label = styleOf(screen.getByText('Create'));
    expect(label.color).toBe(theme.color.txButton);
    expect(label.color).not.toBe(theme.color.txPrimary);
  });
});

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

  it('paints the page surface behind a section header, so a sticky one is opaque', async () => {
    // SectionList sticks its headers by default on iOS. Rows used to be
    // transparent; they are bg/solid/card now, so a transparent header lets
    // OPERATORS and the rows scrolling under it draw on top of each other.
    await render(<SectionHeader>operators</SectionHeader>);
    const root = screen.toJSON() as { props: { style?: unknown } };
    expect(styleOf(root).backgroundColor).toBe(theme.color.bgSolidBase);
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
    // fireEvent.press is async in this @testing-library/react-native version —
    // it wraps the handler call in act() and returns a promise. Leaving it
    // un-awaited let the first press's act-scope still be settling when the
    // second one (below) opened its own, which is exactly what produced
    // "overlapping act() calls" here. Awaiting both is the actual fix, not a
    // suppression of the warning.
    await fireEvent.press(screen.getByText('Create'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(<Button label="Create" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Create'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
