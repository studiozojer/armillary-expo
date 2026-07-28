import type { SessionAPI } from './api';
import { MockSessionAPI } from './mock';

/**
 * The single SessionAPI instance the app talks to.
 *
 * Both the instances list and the session screen import this rather than
 * constructing their own `MockSessionAPI`, so they share one store — an
 * instance created on the list screen is the same one the session screen
 * attaches to. Task 8 makes this host-aware (swapping the mock for a real
 * client behind the same interface); nothing above this seam should need to
 * change when that happens.
 */
export const sessionAPI: SessionAPI = new MockSessionAPI();
