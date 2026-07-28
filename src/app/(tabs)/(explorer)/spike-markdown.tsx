import { MarkdownView } from '@/components/markdown-view';
import { Screen } from '@/components/ui';
import { SAMPLE_MARKDOWN } from '@/lib/fixtures/sample-markdown';

/**
 * The D9 gate, reachable at /spike-markdown.
 *
 * Deliberately not a tab and deliberately fed from a bundled fixture: it
 * renders with no engine running, so markdown rendering can be judged on a
 * device independently of whether the network half works. Jest does not
 * exercise the New Architecture, so this screen is the only thing that
 * actually resolves D9.
 */
export default function SpikeMarkdown() {
  return (
    <Screen edges={['top']}>
      <MarkdownView source={SAMPLE_MARKDOWN} />
    </Screen>
  );
}
