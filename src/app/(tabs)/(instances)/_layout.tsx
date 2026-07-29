import { Stack } from 'expo-router/stack';

export default function InstancesLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Instances' }} />
      {/* Required — a route not registered here has nothing to push onto:
          `NativeTabs.Trigger` is not a navigator, so `Link` to an
          unregistered screen silently no-ops (the sprint-1 defect documented
          in (explorer)/_layout.tsx). */}
      <Stack.Screen name="[instanceId]" options={{ title: 'Instance' }} />
      {/* The `+` sheet. `formSheet`, not `modal`: react-native-screens 4.26 /
          this SDK's native-stack supports it cleanly, and a picker-plus-button
          reads as a sheet, not a full-screen takeover like Capture's `modal`.
          Registered here for the same reason `[instanceId]` is — an
          unregistered route has nothing to push onto.

          `headerShown: false`, and no `title`. A form sheet cannot carry a
          native header — the SDK 57 docs are explicit that "native stack
          headers and nested stack navigators are not supported inside form
          sheet screens, so options such as headerShown, title, and header
          buttons will not render", and send the title into the sheet content
          instead. This route asked for `title` anyway, and "not supported"
          turned out to be worse than nothing rendering (reported on device
          2026-07-29: the Operator row was unreadable).

          The mechanism, confirmed by screenshotting the defect and not by
          reading the option: `expo-router` forks the native-stack navigator
          and, when liquid glass is available, injects `headerTransparent ??=
          true` for any `formSheet` screen
          (`expo-router/src/fork/native-stack/createNativeStackNavigator.tsx`,
          the `needsGlassFix` branch). A transparent header is *defined* as one
          the content starts underneath. So the header did not push the content
          down and did not paint over it either — the title glyphs landed
          directly on top of the first row, rendering "Operator  New instance
          Dispatcher ⌄" as one overlapping line. Worth stating precisely,
          because it means the culprit was never a header colour and no
          `contentStyle` inset would have fixed it: the only repair is to stop
          asking for the header.

          The two sibling presentations are unaffected — `modal` and `push`
          render headers normally, which is why Settings and Capture keep
          theirs, and why they must not be "fixed" to match this.

          The grabber is set explicitly because it is the sheet's only
          remaining affordance. It defaults to `false`
          (`react-native-screens/src/components/Screen.tsx`, and `NO` on the
          iOS side) — so with the header gone and no title row added, a sheet
          left on defaults would have nothing at all indicating it is a sheet
          and nothing indicating it can be pulled away. The content names
          itself (its first row reads "Operator", the button reads "Create"),
          so the grabber is what a title row would otherwise have to be. */}
      <Stack.Screen
        name="new"
        options={{ presentation: 'formSheet', headerShown: false, sheetGrabberVisible: true }}
      />
    </Stack>
  );
}
