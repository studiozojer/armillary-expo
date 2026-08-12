import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * The instance panel's width, from the drawing (`bbjHiHEBoR3xWWruoprPkH`,
 * `444:194`). Fixed rather than a fraction of the screen: the panel's contents
 * were measured at this width, and a percentage would re-open that at every
 * device size for no gain.
 */
export const PANEL_WIDTH = 350;

type Render = () => ReactNode;

type PanelValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** What the current screen wants in the panel; null when none does. */
  content: Render | null;
  register: (render: Render | null) => void;
};

/**
 * Who owns the app's one right-side panel.
 *
 * The drawer has to live ABOVE the navigation stack, because that is the only
 * place it can cover the header — which is the whole point of it (David,
 * 2026-08-12: "should the drawer come in on TOP of the whole page though?").
 * Anything above the stack is global by construction, so the panel would exist
 * on every screen.
 *
 * This is what buys back the scoping: the machinery is global, the CONTENT is
 * registered by whichever screen wants it, and a screen that registers nothing
 * gets a drawer that cannot be opened or swiped. So `Explorer` does not get an
 * empty panel it can drag out by accident — the policy is one line
 * (`swipeEnabled={content !== null}`) rather than a special case per screen.
 */
const PanelContext = createContext<PanelValue | null>(null);

/**
 * The no-provider fallback, returned rather than thrown.
 *
 * Every screen test in this repo renders its screen standalone, with no
 * navigator and no root layout (see `session-screen.test.tsx`'s own note on
 * why). A hook that threw without a provider would fail those suites for a
 * reason that has nothing to do with what they test. Same posture as the
 * safe-area mock in `jest.setup.js`: degrade to inert, don't explode.
 *
 * The cost, stated: a screen that registers panel content outside the provider
 * silently gets no panel. That is why `PanelHost` is in the root layout rather
 * than anywhere a screen could forget it.
 */
const NO_PANEL: PanelValue = {
  open: false,
  setOpen: () => {},
  content: null,
  register: () => {},
};

export function PanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<Render | null>(null);

  const register = useCallback((render: Render | null) => {
    // `setContent(render)` would CALL render — React reads a function argument
    // as an updater. The extra arrow is what stores it instead of invoking it.
    setContent(() => render);
  }, []);

  // A screen that goes away takes its panel with it — otherwise the next screen
  // inherits an open panel describing an instance you navigated away from.
  //
  // It closes on the TRANSITION to null, not on null itself, and the difference
  // is not theoretical: effects run children-first, so on the very first commit
  // a screen's register-and-open runs before this effect, which would still be
  // reading `content` as its initial null and would slam shut the drawer that
  // had just been opened. Caught by `panel-host.test.tsx`, which is why the
  // test asserts the opened state rather than only the closed one.
  //
  // Closing here rather than inside `register` also matters: a re-registration
  // clears and re-sets in the same commit, so `content` never settles on null
  // and the drawer survives a screen re-render — which, for the chat, is every
  // streamed token.
  const previous = useRef<Render | null>(null);
  useEffect(() => {
    if (previous.current !== null && content === null) setOpen(false);
    previous.current = content;
  }, [content]);

  const value = useMemo(() => ({ open, setOpen, content, register }), [open, content, register]);

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelValue {
  return useContext(PanelContext) ?? NO_PANEL;
}

/**
 * Register this screen's panel content for as long as it is mounted.
 *
 * **`render` must be referentially stable** — wrap it in `useCallback`. It is a
 * dependency of the effect below, so a fresh closure every render re-registers
 * every render.
 */
export function usePanelContent(render: Render): void {
  const { register } = usePanel();
  useEffect(() => {
    register(render);
    return () => register(null);
  }, [register, render]);
}
