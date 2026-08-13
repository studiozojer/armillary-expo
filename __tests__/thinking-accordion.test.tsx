import { fireEvent, render } from '@testing-library/react-native';

import { ThinkingAccordion } from '@/components/thinking-accordion';

describe('ThinkingAccordion', () => {
  it('labels the fold with the register line, sized', async () => {
    const { getByText } = await render(
      <ThinkingAccordion blocks={[{ type: 'thinking', thinking: 'let me look', signature: 's' }]} />,
    );
    // 11 chars of "let me look" → "thinking · 11"
    expect(getByText('thinking · 11')).toBeTruthy();
  });

  it('starts collapsed and expands on press', async () => {
    const { getByTestId, queryByText, getByText } = await render(
      <ThinkingAccordion blocks={[{ type: 'thinking', thinking: 'let me look', signature: 's' }]} />,
    );
    const toggle = getByTestId('thinking-toggle');
    expect(queryByText('let me look')).toBeNull();
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(toggle);
    expect(getByText('let me look')).toBeTruthy();
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
  });

  it('says reasoning was redacted rather than showing an empty body', async () => {
    // redacted_thinking arrives ENCRYPTED and can never be displayed. A blank
    // accordion here would read as broken.
    const { getByTestId, getByText } = await render(
      <ThinkingAccordion blocks={[{ type: 'redacted_thinking', data: 'opaque' }]} />,
    );
    await fireEvent.press(getByTestId('thinking-toggle'));
    expect(getByText('Some reasoning was redacted.')).toBeTruthy();
  });

  it('shows both when a round mixed them', async () => {
    const { getByTestId, getByText } = await render(
      <ThinkingAccordion
        blocks={[
          { type: 'thinking', thinking: 'visible part', signature: 's' },
          { type: 'redacted_thinking', data: 'opaque' },
        ]}
      />,
    );
    await fireEvent.press(getByTestId('thinking-toggle'));
    expect(getByText('visible part')).toBeTruthy();
    expect(getByText('Some reasoning was redacted.')).toBeTruthy();
  });
});
