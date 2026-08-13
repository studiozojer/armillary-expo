import { render } from '@testing-library/react-native';

import { ActivityLine } from '../src/components/activity-line';

it('renders nothing when there is no activity', async () => {
  const { toJSON } = await render(<ActivityLine label={null} />);
  expect(toJSON()).toBeNull();
});

it('shows the label it is given', async () => {
  // Today the only caller passes 'working'; the prop stays a string because
  // the meta-status framework will hand it richer text later (D9).
  const { getByText } = await render(<ActivityLine label="working" />);
  expect(getByText('working')).toBeTruthy();
});

it('is announced to screen readers as a live status', async () => {
  const { getByTestId } = await render(<ActivityLine label="working" />);
  const node = getByTestId('activity-line');
  expect(node.props.accessibilityRole).toBe('progressbar');
  expect(node.props.accessibilityLabel).toBe('working');
});
