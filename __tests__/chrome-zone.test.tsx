import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { ChromeZone } from '../src/components/chrome-zone';
import { CircleButton, SectionHeader, Text } from '../src/components/ui';

describe('<ChromeZone>', () => {
  beforeEach(() => mockPush.mockClear());

  it('always carries the settings entry', async () => {
    await render(<ChromeZone />);
    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('renders the trailing controls', async () => {
    await render(
      <ChromeZone trailing={<CircleButton icon="more" accessibilityLabel="More" disabled />} />,
    );
    expect(screen.getByRole('button', { name: 'More' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe('<SectionHeader trailing>', () => {
  it('renders the trailing slot beside the label', async () => {
    await render(<SectionHeader trailing={<Text>All</Text>}>Instances</SectionHeader>);
    expect(screen.getByText('INSTANCES')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
  });
});
