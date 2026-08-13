import { act, render, type RenderResult } from '@testing-library/react-native';
import { Dimensions, Text } from 'react-native';

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

it('re-derives overflow from a width change alone, with no new content-size event', async () => {
  // Simulates rotation / iPad split-view: the window narrows but nothing
  // remounts the horizontal content, so onContentSizeChange never refires.
  // `overflow` must still flip, because it is derived at render time from the
  // measured content width and the live window width together — not cached
  // as a boolean set once, inside the event handler, by the width at that
  // moment. `Dimensions.set` is the same entry point native code uses to
  // report a rotation; `useWindowDimensions` subscribes to it directly.
  const original = Dimensions.get('window');
  try {
    const { container, queryByTestId } = await render(
      <OverflowScroll>
        <Text>content</Text>
      </OverflowScroll>,
    );
    const sv = getScrollView(container);
    await act(async () => {
      sv.props.onContentSizeChange(500, 20); // fits the ambient test window (750)
    });
    expect(queryByTestId('overflow-fade')).toBeNull();

    await act(async () => {
      Dimensions.set({ window: { width: 400, height: 800, scale: 2, fontScale: 2 } });
    });
    // Same 500-wide content, narrower window — no new onContentSizeChange call.
    expect(queryByTestId('overflow-fade')).toBeTruthy();
  } finally {
    await act(async () => {
      Dimensions.set({ window: original });
    });
  }
});
