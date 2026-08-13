import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';

const FADE_WIDTH = 48;

/**
 * The full-bleed shell for wide chat content (tables, fenced code).
 *
 * Escapes the transcript's 16pt inset with negative margins so wide content
 * earns the whole screen before it must scroll, then marks the cut with a
 * right-edge fade into the ground color — the design's answer to a cut table
 * reading as a finished one. The fade renders only while there is genuinely
 * more to the right AND the reader has not yet scrolled; `pointerEvents:
 * "none"` keeps it out of the pan gesture it exists to advertise.
 */
export function OverflowScroll({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [overflow, setOverflow] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Generated tokens carry an already-baked alpha channel (RRGGBBAA, opaque
  // as ...ff — see tokens.gen.ts), not the bare 6-digit hex an appended alpha
  // suffix would assume. Dropping the trailing channel before appending a
  // transparent one keeps the string a valid 8-digit color instead of an
  // unparseable 10-digit one.
  const solid = theme.color.bgSolidBase;
  const transparent = `${solid.slice(0, -2)}00`;
  return (
    <View style={{ marginHorizontal: -theme.space.lg }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ paddingHorizontal: theme.space.lg }}
        onContentSizeChange={(w) => setOverflow(w > width)}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.x > 8)}
        scrollEventThrottle={64}>
        {children}
      </ScrollView>
      {overflow && !scrolled ? (
        <LinearGradient
          testID="overflow-fade"
          pointerEvents="none"
          colors={[transparent, solid]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: FADE_WIDTH }}
        />
      ) : null}
    </View>
  );
}
