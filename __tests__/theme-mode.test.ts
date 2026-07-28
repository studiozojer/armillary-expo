import { normalizeScheme, parseMode, resolveScheme } from '../src/theme/theme-mode';

describe('theme mode', () => {
  it('parses only the two forced modes, defaulting everything else to auto', () => {
    expect(parseMode('light')).toBe('light');
    expect(parseMode('dark')).toBe('dark');
    expect(parseMode('auto')).toBe('auto');
    expect(parseMode(null)).toBe('auto');
    expect(parseMode('DARK')).toBe('auto');
    expect(parseMode('')).toBe('auto');
  });

  it('lets a forced mode win and auto follow the system', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('auto', 'dark')).toBe('dark');
    expect(resolveScheme('auto', 'light')).toBe('light');
  });

  it('normalizes anything that is not dark to light', () => {
    // RN hands back null and "unspecified" as well as the two real values.
    expect(normalizeScheme('dark')).toBe('dark');
    expect(normalizeScheme('light')).toBe('light');
    expect(normalizeScheme(null)).toBe('light');
    expect(normalizeScheme(undefined)).toBe('light');
    expect(normalizeScheme('unspecified')).toBe('light');
  });
});
