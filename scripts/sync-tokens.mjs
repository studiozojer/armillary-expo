#!/usr/bin/env node
// Generates src/theme/tokens.gen.ts from daoUI's token catalog.
//
// daoUI is a Swift package and cannot be imported here, but tokens.json is
// language-neutral and is the real source. The output is COMMITTED rather than
// resolved at build time, because CI builds this repo alone and ../daoUI does
// not exist there — the same constraint that shaped studiozojer.co's
// sync-glyphs.mjs, which this follows.
//
// Run: npm run sync-tokens

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DAOUI = process.env.DAOUI_PATH ?? join(HERE, '..', '..', 'daoUI');
const OUT = join(HERE, '..', 'src', 'theme', 'tokens.gen.ts');

// The roles this app consumes. Deliberately a subset: daoUI carries 146
// semantics and emitting all of them would make the generated file a catalog
// nobody reads. Add a role here when a screen needs it.
const ROLES = [
  'tx/primary', 'tx/secondary', 'tx/tertiary', 'tx/body', 'tx/accent', 'tx/error',
  'tx/warning', 'tx/success', 'tx/disabled', 'tx/button',

  // Opaque surfaces. These, not the bg/* overlays, are what a page and a card
  // are painted with — the overlays are elevation washes meant to sit on top.
  'bg/solid/base', 'bg/solid/card', 'bg/solid/card-secondary',
  'bg/solid/card-hover', 'bg/solid/card-pressed',
  'bg/solid/button', 'bg/solid/button-hover', 'bg/solid/button-pressed',
  'bg/solid/button-disabled',

  // Overlays, used as overlays: generic interactive feedback on non-card surfaces.
  'bg/primary', 'bg/secondary', 'bg/accent', 'bg/warning', 'bg/error',
  'bg/hover', 'bg/pressed',

  'bd/base', 'bd/primary', 'bd/secondary', 'bd/card', 'bd/accent',
  'bd/hover', 'bd/pressed',

  'ic/primary', 'ic/secondary', 'ic/tertiary', 'ic/accent',
];

function die(message) {
  // Fail loudly rather than emitting an empty file. A generator that silently
  // produces nothing is the nullglob failure: the build stays green and the
  // app renders unstyled.
  console.error(`sync-tokens: ${message}`);
  process.exit(1);
}

if (!existsSync(DAOUI)) {
  die(`daoUI not found at ${DAOUI}. Clone it beside this repo, or set DAOUI_PATH.`);
}

const tokensPath = join(DAOUI, 'tokens.json');
if (!existsSync(tokensPath)) die(`${tokensPath} does not exist — is this really daoUI?`);

const { primitives, semantics } = JSON.parse(readFileSync(tokensPath, 'utf8'));

let sourceCommit = 'unknown';
try {
  sourceCommit = execFileSync('git', ['-C', DAOUI, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch {
  console.warn('sync-tokens: could not read daoUI HEAD; stamping "unknown"');
}

/** #RRGGBB + alpha -> #RRGGBBAA, which React Native accepts directly. */
function withAlpha(hex, alpha) {
  const a = Math.round(Math.max(0, Math.min(1, alpha ?? 1)) * 255);
  const base = hex.replace('#', '').slice(0, 6);
  return `#${base}${a.toString(16).padStart(2, '0')}`.toLowerCase();
}

/**
 * A semantic carries either `primitive` (resolve against the active mode's
 * primitive value) or `literal` (its own light/dark hex, because the colour was
 * never promoted to the primitive layer). `alphaDark` overrides `alpha` in dark
 * mode where the catalog differs. — daoUI tokens.json § themeRule
 */
function resolve(role, mode) {
  const spec = semantics[role];
  if (!spec) die(`role "${role}" is not in daoUI's semantics. Roles drift; fix the list.`);

  const alpha = mode === 'dark' && spec.alphaDark !== undefined ? spec.alphaDark : spec.alpha;

  if (spec.literal) return withAlpha(spec.literal[mode], alpha);

  const primitive = primitives[spec.primitive];
  if (!primitive) die(`role "${role}" points at missing primitive "${spec.primitive}".`);
  return withAlpha(primitive[mode], alpha * (primitive.alpha ?? 1));
}

/**
 * `tx/primary` -> `txPrimary`, `bg/solid/card-hover` -> `bgSolidCardHover`.
 *
 * Every segment after the prefix participates. The earlier version destructured
 * only the first two, so `bg/solid/base` and `bg/solid/card` both keyed to
 * `bgSolid` and silently overwrote each other — invisible while the role list
 * happened to contain no multi-segment names.
 */
function key(role) {
  const [prefix, ...rest] = role.split('/');
  return prefix + rest.join('-').replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
}

// Track which role produced each key. The key format is deliberately lossy
// (e.g., 'bg/solid/card-secondary' and 'bg/solid-card/secondary' both become
// 'bgSolidCardSecondary'), so collisions cannot be prevented by construction.
// Instead, we make them loud at generation time.
const keyToRole = {};
const light = {};
const dark = {};

for (const role of ROLES) {
  const k = key(role);

  if (keyToRole[k]) {
    die(`collision: "${role}" and "${keyToRole[k]}" both key to "${k}". The key format is lossy by design; fix the role list or the key logic.`);
  }

  keyToRole[k] = role;
  light[k] = resolve(role, 'light');
  dark[k] = resolve(role, 'dark');
}

const body = `// GENERATED by scripts/sync-tokens.mjs — do not edit by hand.
//
// Source: daoUI @ ${sourceCommit} (tokens.json)
// Regenerate: npm run sync-tokens
//
// The provenance line above is load-bearing. zhouyi carries a src/theme/
// colors.gen.ts whose first line reads "Extracted BY HAND from the daoUI asset
// catalogs" — a .gen filename over content no generator produced, and its
// sibling tokens.ts still cites KairosDesign, which daoUI superseded on
// 2026-07-09. A citation that cannot be followed reads exactly like one that
// can. This file can be followed: re-run the script and diff.

export const DAOUI_SOURCE_COMMIT = ${JSON.stringify(sourceCommit)};

export const ROLE_COUNT = ${ROLES.length};

export const lightColors = ${JSON.stringify(light, null, 2)} as const;

export const darkColors = ${JSON.stringify(dark, null, 2)} as const;

export type ColorRole = keyof typeof lightColors;
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
console.log(`sync-tokens: wrote ${ROLES.length} roles from daoUI @ ${sourceCommit}`);
