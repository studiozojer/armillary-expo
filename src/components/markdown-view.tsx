import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import Markdown, { Renderer, type MarkdownProps, type MarkedStyles } from 'react-native-marked';

// `UserTheme` is declared in the package but not re-exported from its entry
// point, so the prop type is taken from the component's own props instead of
// being re-declared here — a re-declaration would drift the first time the
// library changed it.
export type MarkedTheme = MarkdownProps['theme'];

export type MarkdownViewProps = {
  source: string;
  /** Colours and spacing, supplied by the app theme (see src/theme). */
  theme?: MarkedTheme;
  /** Per-element overrides layered on top of the theme. */
  styles?: MarkedStyles;
};

const deselect = (node: ReactNode): ReactNode =>
  isValidElement(node) ? cloneElement(node as ReactElement<{ selectable?: boolean }>, { selectable: false }) : node;

/**
 * The library's Renderer hardcodes `selectable: true` on every text node it
 * emits, with no option to turn it off. In the chat list that makes iOS
 * answer a long-press with the system copy callout on top of the message
 * menu — two affordances on one gesture. Selection is SelectTextSheet's job,
 * so the flag is stripped here at the two funnels every text path shares:
 * `getTextNode` (heading/paragraph/emphasis/code/table — all of it) and
 * `link`, the one method that builds its own Text. `getTextNode` is
 * TS-private but a plain prototype method in the shipped package; the
 * instance-level reassignment shadows it for the renderer's own `this` calls.
 */
function nonSelectableRenderer(): Renderer {
  const renderer = new Renderer();
  const patchable = renderer as unknown as Record<'getTextNode' | 'link', (...args: unknown[]) => ReactNode>;
  const originalTextNode = patchable.getTextNode.bind(renderer);
  const originalLink = patchable.link.bind(renderer);
  patchable.getTextNode = (...args) => deselect(originalTextNode(...args));
  patchable.link = (...args) => deselect(originalLink(...args));
  return renderer;
}

// Module-level: stable across renders (the library memoizes its parser on
// renderer identity), and keys only need sibling uniqueness, which the
// shared slugger preserves.
const renderer = nonSelectableRenderer();

/**
 * Renders CommonMark.
 *
 * The library was chosen (D9) for two extension points we do not use yet:
 * `Renderer` for per-element components, and `MarkedTokenizer` for *new syntax*
 * — which is how `[[wikilinks]]` become tappable in a later sprint. Until then
 * a wikilink renders as literal text, which is correct rather than merely
 * tolerable: the corpus is full of them and none of them resolve yet.
 */
export function MarkdownView({ source, theme, styles }: MarkdownViewProps) {
  return (
    <Markdown
      value={source}
      theme={theme}
      styles={styles}
      renderer={renderer}
      flatListProps={{
        initialNumToRender: 12,
        contentContainerStyle: { paddingHorizontal: 16, paddingBottom: 32 },
      }}
    />
  );
}
