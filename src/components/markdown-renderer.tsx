import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import { Renderer } from 'react-native-marked';

import { MessageCode } from './message-code';
import { MessageTable } from './message-table';

export const deselect = (node: ReactNode): ReactNode =>
  isValidElement(node) ? cloneElement(node as ReactElement<{ selectable?: boolean }>, { selectable: false }) : node;

/**
 * The library's Renderer hardcodes `selectable: true` on every text node,
 * which on iOS answers a long-press with the system copy callout on top of
 * the message menu. Selection is SelectTextSheet's job, so the flag is
 * stripped at the two funnels every text path shares. (Moved from
 * markdown-view.tsx when MessageMarkdown became the second consumer.)
 */
export function patchNonSelectable<R extends Renderer>(renderer: R): R {
  const patchable = renderer as unknown as Record<'getTextNode' | 'link', (...args: unknown[]) => ReactNode>;
  const originalTextNode = patchable.getTextNode.bind(renderer);
  const originalLink = patchable.link.bind(renderer);
  patchable.getTextNode = (...args) => deselect(originalTextNode(...args));
  patchable.link = (...args) => deselect(originalLink(...args));
  return renderer;
}

// Module-level: stable identity (the library memoizes its parser on it).
export const sharedRenderer = patchNonSelectable(new Renderer());

/** Chat's renderer: tables and fenced code go full-bleed with an edge fade. */
class ChatRenderer extends Renderer {
  table(
    header: ReactNode[][],
    rows: ReactNode[][][],
    _tableStyle?: ViewStyle,
    _rowStyle?: ViewStyle,
    _cellStyle?: ViewStyle,
  ): ReactNode {
    return <MessageTable key={(this as unknown as { getKey(): string }).getKey()} header={header} rows={rows} />;
  }
  code(text: string, _language?: string, _containerStyle?: ViewStyle, _textStyle?: TextStyle): ReactNode {
    return <MessageCode key={(this as unknown as { getKey(): string }).getKey()} text={text} />;
  }
}

// Module-level: stable identity, same reason as sharedRenderer above.
export const chatRenderer = patchNonSelectable(new ChatRenderer());
