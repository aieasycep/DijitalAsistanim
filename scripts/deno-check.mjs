#!/usr/bin/env node
// Typechecks every Supabase Edge Function with Deno (uses a local `deno` from PATH or the npm-installed binary).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = path.join(ROOT, 'supabase', 'functions');

function findDeno() {
  for (const candidate of ['deno', path.join(ROOT, 'node_modules', '.bin', 'deno')]) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

const deno = findDeno();
if (!deno) {
  console.error('deno not found. Install Deno 2 (https://deno.com) or `pnpm add -Dw deno`.');
  process.exit(2);
}

const entries = readdirSync(FUNCTIONS)
  .filter(
    (d) =>
      !d.startsWith('_') && !d.startsWith('.') && statSync(path.join(FUNCTIONS, d)).isDirectory(),
  )
  .map((d) => path.join(FUNCTIONS, d, 'index.ts'))
  .filter((f) => existsSync(f));

if (entries.length === 0) {
  console.error('No edge functions found.');
  process.exit(1);
}

const res = spawnSync(deno, ['check', '--config', path.join(FUNCTIONS, 'deno.json'), ...entries], {
  cwd: FUNCTIONS,
  stdio: 'inherit',
  env: { ...process.env, DENO_NO_UPDATE_CHECK: '1', DENO_NO_PROMPT: '1' },
});
if (res.status !== 0) process.exit(res.status ?? 1);
console.log(`✓ deno check passed for ${entries.length} functions`);
