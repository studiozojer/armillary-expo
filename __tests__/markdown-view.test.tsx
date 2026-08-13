import { render, screen } from '@testing-library/react-native';
import { MarkdownView } from '../src/components/markdown-view';
import { SAMPLE_MARKDOWN } from '../src/lib/fixtures/sample-markdown';

// NOTE: @testing-library/react-native v14 made `render` async and moved the
// queries onto `screen`. `const { getByText } = render(...)` — the shape every
// pre-v14 example uses — silently yields undefined here.

describe('MarkdownView', () => {
  it('renders heading text from markdown source', async () => {
    await render(<MarkdownView source={SAMPLE_MARKDOWN} />);
    expect(screen.getByText('harness anatomy')).toBeTruthy();
  });

  it('renders a wikilink as visible plain text rather than crashing', async () => {
    await render(<MarkdownView source={SAMPLE_MARKDOWN} />);
    // Wikilink navigation is out of scope for sprint 1; the requirement is that
    // the corpus's most common non-CommonMark construct degrades visibly.
    expect(screen.getByText(/the-flat-window/)).toBeTruthy();
  });

  it('renders bold and italic inline emphasis', async () => {
    await render(<MarkdownView source={SAMPLE_MARKDOWN} />);
    expect(screen.getByText(/~5% loop, ~95% plumbing/)).toBeTruthy();
    expect(screen.getByText('neither')).toBeTruthy();
  });

  it('renders table cell content', async () => {
    await render(<MarkdownView source={SAMPLE_MARKDOWN} />);
    expect(screen.getByText('a small distributed system')).toBeTruthy();
  });

  it('renders an empty document without throwing', async () => {
    await expect(render(<MarkdownView source="" />)).resolves.toBeDefined();
  });

  it('renders text that is not system-selectable, so a long-press reaches the row menu alone', async () => {
    // react-native-marked's own Renderer hardcodes `selectable: true` on every
    // text node — on device that makes iOS answer a long-press with the system
    // copy callout on top of the message menu (David, 2026-08-06). Selection
    // is SelectTextSheet's job; the chat list must not compete with it.
    await render(<MarkdownView source={SAMPLE_MARKDOWN} />);
    expect(screen.getByText('harness anatomy').props.selectable).toBe(false);
    expect(screen.getByText(/the-flat-window/).props.selectable).toBe(false);
    expect(screen.getByText('a small distributed system').props.selectable).toBe(false);
  });

  it('overrides the library-hardcoded list background with transparent', async () => {
    // The library sets #fff/#000 by SYSTEM scheme on its own FlatList style —
    // an app themed dark on a light-mode phone gets a white slab under every
    // document. flatListProps.style is spread after it and wins.
    const { container } = await render(<MarkdownView source="hello" />);
    const scrollViews = container.queryAll((instance) => instance.type === 'RCTScrollView');
    expect(scrollViews).toHaveLength(1);
    const style = Object.assign({}, ...[scrollViews[0].props.style].flat(Infinity).filter(Boolean));
    expect(style.backgroundColor).toBe('transparent');
  });
});
