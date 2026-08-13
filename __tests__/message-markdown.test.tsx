import { render } from '@testing-library/react-native';

import { MessageMarkdown } from '../src/components/message-markdown';

// NOTE (see markdown-view.test.tsx): @testing-library/react-native v14 made
// `render` async — an un-awaited call destructures off a Promise, not a
// result, so every render below is awaited. v14 also dropped the `UNSAFE_*`
// by-component-type queries entirely (they queried the host tree, not the
// composite one, so a FlatList import was never matchable by identity
// anyway); `RCTScrollView` is the host primitive every RN FlatList/ScrollView
// bottoms out on, confirmed against MarkdownView's own tree in
// markdown-view.test.tsx's sibling suite.

it('renders markdown without nesting a FlatList', async () => {
  // The whole point of this component: react-native-marked's default form IS
  // a FlatList, which nested inside the chat's inverted list is the gesture
  // stack the design diagnosed. A regression here reintroduces all of it.
  const { container } = await render(<MessageMarkdown source={'# Hi\n\nA paragraph.'} />);
  expect(container.queryAll((instance) => instance.type === 'RCTScrollView')).toHaveLength(0);
});

it('applies the studio ramp, not the system font', async () => {
  // Diagnosis 2 in the design: chat prose rendered in the system font because
  // the screen passed theme= but not styles=. This component owns both.
  const { getByText } = await render(<MessageMarkdown source={'A paragraph.'} />);
  const flat = Object.assign({}, ...[getByText('A paragraph.').props.style].flat(Infinity).filter(Boolean));
  expect(flat.fontFamily).toMatch(/Whyte/);
});
