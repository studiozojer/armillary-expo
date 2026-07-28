import AppTabs from '@/components/app-tabs';

/**
 * The tab bar, one level below the root.
 *
 * It sits inside a group rather than at the root so the root can be a `Stack` —
 * which is what lets Settings present as a modal *above* the tabs, reachable
 * from either of them. A screen registered inside one tab's stack can only be
 * pushed from that tab; a screen registered here would still be inside the tab
 * bar. Only the root stack is above both.
 */
export default function TabsLayout() {
  return <AppTabs />;
}
