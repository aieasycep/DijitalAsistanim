#!/usr/bin/env node
// No-dead-button policy: fails on TODO/FIXME/"coming soon"/placeholder markers and on empty press handlers.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', '.expo', 'dist', 'build', 'coverage', 'ios', 'android', '.turbo', 'design-reference', 'icons']);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.sql', '.kt', '.swift']);

const MARKERS = [
  { name: 'TODO', re: /\bTODO\b/ },
  { name: 'FIXME', re: /\bFIXME\b/ },
  { name: 'coming soon', re: /coming soon|çok yakında|yakında gelecek/i },
  { name: 'placeholder feature', re: /PLACEHOLDER FEATURE|placeholder feature/i },
  { name: 'temp button', re: /TEMP BUTTON|temp button/i },
  { name: 'not implemented', re: /not implemented|henüz uygulanmadı|throw new Error\(['"]unimplemented/i },
];
const EMPTY_HANDLERS = [
  { name: 'empty onPress', re: /onPress=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/ },
  { name: 'empty onClick', re: /onClick=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/ },
  { name: 'noop onPress', re: /onPress=\{\s*(noop|undefined)\s*\}/ },
  { name: 'onPress alert placeholder', re: /onPress=\{\s*\(\s*\)\s*=>\s*(alert|Alert\.alert)\(['"](TODO|Yakında|Soon)/i },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(entry))) out.push(full);
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

if (problems.length) {
  console.error('Dead-code / placeholder check failed:\n' + problems.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log('✓ no TODO/FIXME/placeholder markers or empty handlers');
