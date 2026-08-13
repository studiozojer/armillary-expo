import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The turn is running — one line above the composer, in accent (design
 * 2026-08-12 D9, as revised 08-13). Hand-rolled deliberately: iOS has no
 * idiom for "the assistant is working"; the platform answer in reach,
 * `ActivityIndicator`, is declined because this surface is about to become
 * the instance's live meta status (title/description of the context window,
 * a parallel framework) — the `label` prop is that seam, and today its only
 * caller passes 'working' (`practices/platform-idiom`).
 *
 * The dot breathes; the label never animates. Renders nothing at all when
 * idle, so the composer does not shift when a turn ends. Per-call detail
 * (which tool is running) lives in the transcript's pending ToolRow, not
 * here.
 */
export function ActivityLine({ label }: { label: string | null }) {
  const theme = useTheme();
  const breath = useRef(new Animated.Value(1)).current;
  const active = label !== null;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, breath]);
  if (!label) return null;
  return (
    <View
      testID="activity-line"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.sm,
        paddingHorizontal: theme.space.lg,
        paddingTop: theme.space.xxs,
        paddingBottom: theme.space.xs,
      }}>
      <Animated.View
        style={{
          width: 5,
          height: 5,
          borderRadius: theme.radius.full,
          backgroundColor: theme.color.txAccent,
          opacity: breath,
        }}
      />
      <Text variant="mono" color="txAccent" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
