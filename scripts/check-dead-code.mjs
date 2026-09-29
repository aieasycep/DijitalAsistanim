#!/usr/bin/env node
// No-dead-button policy: fails on TODO/FIXME/"coming soon"/placeholder markers, on empty press handlers and
// on forbidden user-facing copy (end-to-end encryption claims).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.expo',
  'dist',
  'build',
  'coverage',
  'ios',
  'android',
  '.turbo',
  'design-reference',
  'icons',
]);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.sql', '.kt', '.swift']);

const MARKERS = [
  { name: 'TODO', re: /\bTODO\b/ },
  { name: 'FIXME', re: /\bFIXME\b/ },
  { name: 'coming soon', re: /coming soon|çok yakında|yakında gelecek/i },
  { name: 'placeholder feature', re: /PLACEHOLDER FEATURE|placeholder feature/i },
  { name: 'temp button', re: /TEMP BUTTON|temp button/i },
  {
    name: 'not implemented',
    re: /not implemented|henüz uygulanmadı|throw new Error\(['"]unimplemented/i,
  },
];
const EMPTY_HANDLERS = [
  { name: 'empty onPress', re: /onPress=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/ },
  { name: 'empty onClick', re: /onClick=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/ },
  { name: 'noop onPress', re: /onPress=\{\s*(noop|undefined)\s*\}/ },
  {
    name: 'onPress alert placeholder',
    re: /onPress=\{\s*\(\s*\)\s*=>\s*(alert|Alert\.alert)\(['"](TODO|Yakında|Soon)/i,
  },
];

// Code that ends up in the app bundle must read public config as static `process.env.EXPO_PUBLIC_X` member
// expressions: Expo inlines only those at bundle time, a dynamic `process.env[name]` is empty on the device
// (a Supabase build silently became a demo build this way once).
const BUNDLE_DIRS = ['apps/mobile/src', 'apps/mobile/app', 'apps/mobile/modules', 'packages'];
const BUNDLE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
const BUNDLE_RULES = [
  { name: 'dynamic process.env read (never inlined in the app bundle)', re: /process\.env\[/ },
];
const isTestFile = (rel) => /__tests__|\.test\.|\/testing\//.test(rel);

// User-facing copy must never claim (or even discuss) end-to-end encryption — the product does not offer it.
const COPY_DIRS = ['packages/i18n/src/locales', 'apps/web/src/i18n', 'apps/mobile/assets/locales'];
const COPY_EXT = new Set(['.json', '.ts', '.tsx']);
const FORBIDDEN_COPY = [
  { name: 'end-to-end encryption claim', re: /u[çc]tan\s+uca|end[\s-]to[\s-]end/i },
];

function walk(dir, out = [], ext = EXT) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out, ext);
    else if (ext.has(path.extname(entry))) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts/check-dead-code.mjs')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const { name, re } of [...MARKERS, ...EMPTY_HANDLERS]) {
      if (re.test(line)) problems.push(`${rel}:${i + 1}: ${name}`);
    }
  });
}

for (const dir of BUNDLE_DIRS) {
  for (const file of walk(path.join(ROOT, dir), [], BUNDLE_EXT)) {
    const rel = path.relative(ROOT, file);
    if (isTestFile(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const { name, re } of BUNDLE_RULES) {
        if (re.test(line)) problems.push(`${rel}:${i + 1}: ${name}`);
      }
    });
  }
}

for (const dir of COPY_DIRS) {
  for (const file of walk(path.join(ROOT, dir), [], COPY_EXT)) {
    const rel = path.relative(ROOT, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const { name, re } of FORBIDDEN_COPY) {
        if (re.test(line)) problems.push(`${rel}:${i + 1}: ${name}`);
      }
    });
  }
}

if (problems.length) {
  console.error(
    'Dead-code / placeholder check failed:\n' + problems.map((p) => ` - ${p}`).join('\n'),
  );
  process.exit(1);
}
console.log('✓ no TODO/FIXME/placeholder markers, empty handlers or forbidden copy');
