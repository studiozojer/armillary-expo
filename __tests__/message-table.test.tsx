import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MessageTable } from '../src/components/message-table';

const cell = (t: string) => [<Text key={t}>{t}</Text>];

it('renders every header and body cell it is given', async () => {
  const { getByText } = await render(
    <MessageTable header={[cell('Role'), cell('Value')]} rows={[[cell('bgSuccess'), cell('missing')]]} />,
  );
  expect(getByText('Role')).toBeTruthy();
  expect(getByText('bgSuccess')).toBeTruthy();
  expect(getByText('missing')).toBeTruthy();
});
