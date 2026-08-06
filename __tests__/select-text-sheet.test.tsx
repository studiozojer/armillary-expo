import { fireEvent, render, screen } from '@testing-library/react-native';

import { SelectTextSheet } from '../src/components/select-text-sheet';

describe('SelectTextSheet', () => {
  it('shows the given text with selection enabled', async () => {
    await render(<SelectTextSheet text={'# raw *markdown* stays raw'} onDone={() => {}} />);
    const text = screen.getByText('# raw *markdown* stays raw');
    // The whole point of the sheet: system selection handles work here.
    expect(text.props.selectable).toBe(true);
  });

  it('renders nothing when text is null', async () => {
    await render(<SelectTextSheet text={null} onDone={() => {}} />);
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('calls onDone from the Done button', async () => {
    const onDone = jest.fn();
    await render(<SelectTextSheet text="hello" onDone={onDone} />);
    fireEvent.press(screen.getByText('Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('calls onDone when the modal requests close (Android back / iOS swipe-down)', async () => {
    const onDone = jest.fn();
    await render(<SelectTextSheet text="hello" onDone={onDone} />);
    fireEvent(screen.getByTestId('select-text-modal'), 'requestClose');
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
