import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', 'src');

// Generated files are the one legitimate home for raw colour values.
const ALLOWED = new Set(['tokens.gen.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) && !ALLOWED.has(entry) ? [full] : [];
  });
}

describe('colour discipline', () => {
  it('has no hex literals outside the generated token file', () => {
    // src/theme/index.ts states the rule in its own comment: a literal hex
    // anywhere else cannot follow daoUI when daoUI moves. This makes the rule
    // mechanical instead of a habit — habits are what let the Expo template's
    // #000000 and #3c87f7 live here unnoticed through a whole sprint.
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/#[0-9a-fA-F]{3,8}\b/.test(line)) {
            offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
