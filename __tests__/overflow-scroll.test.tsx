import { act, render, type RenderResult } from '@testing-library/react-native';
import { Text } from 'react-native';

import { OverflowScroll } from '../src/components/overflow-scroll';

// NOTE (see markdown-view.test.tsx / message-markdown.test.tsx): RNTL v14
// made `render` async and dropped `UNSAFE_getByType` entirely — queries now
// run over the host tree, not the composite one. `RCTScrollView` is the host
// primitive ScrollView bottoms out on, so props like `onContentSizeChange`
// and `onScroll` are read off that host instance instead. `act` itself must
// be awaited too: the synchronous form warns ("act(async () => ...) without
// await") and returns before the state update it triggers has flushed, so an
// un-awaited call leaves the very next assertion reading pre-update state.
const getScrollView = (container: RenderResult['container']) =>
  container.queryAll((instance: { type: string }) => instance.type === 'RCTScrollView')[0];

it('shows no fade when the content fits', async () => {
  const { container, queryByTestId } = await render(
    <OverflowScroll>
      <Text>short</Text>
    </OverflowScroll>,
  );
  await act(async () => {
    getScrollView(container).props.onContentSizeChange(100, 20);
  });
  expect(queryByTestId('overflow-fade')).toBeNull();
});

it('shows the fade on overflow and lifts it once scrolled', async () => {
  const { container, queryByTestId } = await render(
    <OverflowScroll>
      <Text>wide</Text>
    </OverflowScroll>,
  );
  const sv = getScrollView(container);
  await act(async () => {
    sv.props.onContentSizeChange(900, 20); // wider than any window
  });
  expect(queryByTestId('overflow-fade')).toBeTruthy();
  await act(async () => {
    sv.props.onScroll({ nativeEvent: { contentOffset: { x: 40 } } });
  });
  expect(queryByTestId('overflow-fade')).toBeNull();
});
