/** Whether the root layout may render and release the splash.
 *
 * useFonts never reports loaded=true on failure — it sets an error and
 * leaves loaded false forever (expo-font/build/FontHooks.js). Gating purely
 * on `loaded` therefore turns any font-load failure into an indefinite
 * splash hang. An error means the faces are not coming, so proceed in system
 * fonts: degraded typography is a bad screenshot, a hang is a dead app.
 */
export function splashReady(loaded: boolean, error: Error | null): boolean {
  return loaded || error !== null;
}
