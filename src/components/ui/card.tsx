import { Box, type BoxProps } from './box';

/**
 * An elevated surface. Opaque by construction — never an elevation overlay.
 *
 * `bg` is removed from the prop type, not merely overridden by argument order:
 * an override that fails silently (spread after the hardcoded value) still
 * lets `<Card bg="bgPrimary" />` compile and quietly contradict this
 * component's one invariant. Omitting `bg` from the type makes that a
 * compile error instead, which is what "by construction" is supposed to mean.
 */
export function Card({ p = 'md', radius = 'lg', ...rest }: Omit<BoxProps, 'bg'>) {
  return <Box p={p} radius={radius} bg="bgSolidCard" {...rest} />;
}
