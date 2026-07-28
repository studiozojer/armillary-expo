import { splashReady } from '../src/theme/splash';

describe('splashReady', () => {
  it('is ready once fonts load with no error', () => {
    expect(splashReady(true, null)).toBe(true);
  });

  it('is not ready while fonts are still loading and there is no error', () => {
    expect(splashReady(false, null)).toBe(false);
  });

  it('is ready when loading has failed — otherwise the app hangs on the splash forever', () => {
    expect(splashReady(false, new Error('font load failed'))).toBe(true);
  });

  it('is ready when loaded is true even alongside an error', () => {
    expect(splashReady(true, new Error('font load failed'))).toBe(true);
  });
});
