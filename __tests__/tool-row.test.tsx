import { render } from '@testing-library/react-native';

import { compactChars, ToolRow } from '../src/components/tool-row';

it('compacts result sizes the way the design drew them', () => {
  expect(compactChars(412)).toBe('412');
  expect(compactChars(2800)).toBe('2.8k');
});

it('renders label and size for an answered call', async () => {
  const { getByText } = await render(
    <ToolRow row={{ kind: 'tool', id: 'e1', seq: 1, label: 'read_file: a.md', result: { ok: true, status: 'ok', chars: 2800 } }} />,
  );
  expect(getByText('read_file: a.md')).toBeTruthy();
  expect(getByText('2.8k')).toBeTruthy();
});

it('shows the verbatim machine status on a refusal', async () => {
  const { getByText } = await render(
    <ToolRow row={{ kind: 'tool', id: 'e1', seq: 1, label: 'write_file: a.md', result: { ok: false, status: 'permission_denied', chars: 0 } }} />,
  );
  expect(getByText('permission_denied')).toBeTruthy();
});
