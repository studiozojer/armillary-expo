import { render, screen } from '@testing-library/react-native';

import { Icon, ICONS } from '../src/components/ui/icon';

// toJSON()'s tree is the only stable way to reach the host SymbolView node's
// props here — there is no getByRole/getByLabelText angle on a component that
// is deliberately unlabelled, which is the point being tested. `screen.toJSON()`
// return type isn't exported by the package, hence the local shape.
type JsonNode = { type: string; props: Record<string, unknown>; children: JsonNode[] | null };

function findByType(node: JsonNode | null, type: string): JsonNode | null {
  if (!node) return null;
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const found = findByType(child, type);
    if (found) return found;
  }
  return null;
}

describe('<Icon>', () => {
  it('names every icon on BOTH platforms', () => {
    // This is the assertion that actually prevents a blank render. expo-symbols
    // reads name['web'] (or ['android']) off-Apple; if that key is missing it
    // renders props.fallback, which is nothing. An icon named only for iOS
    // therefore looks perfect on device and is invisible everywhere else — the
    // failure is total and silent, and no device walk would catch it.
    for (const [name, spec] of Object.entries(ICONS)) {
      expect(spec.ios).toBeTruthy();
      expect(spec.web).toBeTruthy();
      expect(name).not.toBe('');
    }
  });

  it('covers everything the Explorer rows need', () => {
    for (const required of ['folder', 'file', 'chevron'] as const) {
      expect(ICONS).toHaveProperty(required);
    }
  });

  it('hides itself from assistive technology on both platforms', async () => {
    // Every icon here is decorative — the row, button or heading beside it
    // carries the label. Both props are required, not either/or:
    // accessibilityElementsHidden is the iOS side, importantForAccessibility
    // is the Android/web side, and a future edit dropping just one of them
    // would silently un-hide the icon on exactly one platform.
    await render(<Icon name="folder" />);
    const node = findByType(screen.toJSON() as JsonNode | null, 'ViewManagerAdapter_SymbolModule');
    expect(node?.props.accessibilityElementsHidden).toBe(true);
    expect(node?.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
