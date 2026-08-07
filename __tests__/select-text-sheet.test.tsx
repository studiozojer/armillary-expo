import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { SelectTextSheet } from '../src/components/select-text-sheet';

describe('SelectTextSheet', () => {
  it('iOS: shows the text in a non-editable TextInput — the only RN element with real selection handles there', async () => {
    // A selectable <Text> on iOS gives only the select-all copy callout —
    // drag handles do not exist for Text on iOS (David hit exactly this on
    // device, 2026-08-06). A UITextView via TextInput is the platform's one
    // route to partial selection.
    await render(<SelectTextSheet text={'# raw *markdown* stays raw'} onDone={() => {}} />);
    const input = screen.getByDisplayValue('# raw *markdown* stays raw');
    expect(input.props.editable).toBe(false);
    expect(input.props.multiline).toBe(true);
  });

  it('Android: shows the text as selectable Text — a non-editable TextInput blocks selection there', async () => {
    const replaced = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await render(<SelectTextSheet text={'# raw *markdown* stays raw'} onDone={() => {}} />);
      const text = screen.getByText('# raw *markdown* stays raw');
      expect(text.props.selectable).toBe(true);
    } finally {
      replaced.restore();
    }
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
