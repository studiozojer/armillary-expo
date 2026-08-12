import { fireEvent, render } from '@testing-library/react-native';

import { ThinkingAccordion } from '@/components/thinking-accordion';

describe('ThinkingAccordion', () => {
  it('starts collapsed and expands on press', async () => {
    const { getByTestId, queryByText, getByText } = await render(
      <ThinkingAccordion blocks={[{ type: 'thinking', thinking: 'let me look', signature: 's' }]} />,
    );
    expect(queryByText('let me look')).toBeNull();
    await fireEvent.press(getByTestId('thinking-toggle'));
    expect(getByText('let me look')).toBeTruthy();
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
