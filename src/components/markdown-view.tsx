import Markdown, { type MarkdownProps, type MarkedStyles } from 'react-native-marked';

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
      flatListProps={{
        initialNumToRender: 12,
        contentContainerStyle: { paddingHorizontal: 16, paddingBottom: 32 },
      }}
    />
  );
}
