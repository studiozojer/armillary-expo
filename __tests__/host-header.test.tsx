import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text as RNText } from 'react-native';

import { HostHeader } from '../src/components/host-header';
import { families } from '../src/theme/fonts.gen';

describe('<HostHeader>', () => {
  it('names the machine in the display register', async () => {
    await render(<HostHeader label="stjerneborg" />);
    const name = screen.getByText('stjerneborg');
    expect((StyleSheet.flatten(name.props.style) as { fontFamily?: string }).fontFamily).toBe(
      families.whyteInk.display,
    );
  });

  it('renders the caller-owned line beneath the name', async () => {
    await render(
      <HostHeader label="benatky">
        <RNText>4 operators • 15 repos • 2 commons ›</RNText>
      </HostHeader>,
    );
    expect(screen.getByText('benatky')).toBeTruthy();
    expect(screen.getByText('4 operators • 15 repos • 2 commons ›')).toBeTruthy();
  });
});
