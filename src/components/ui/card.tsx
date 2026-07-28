import { Box, type BoxProps } from './box';

/** An elevated surface. Opaque by construction — never an elevation overlay. */
export function Card({ p = 'md', radius = 'lg', ...rest }: BoxProps) {
  return <Box p={p} radius={radius} bg="bgSolidCard" {...rest} />;
}
