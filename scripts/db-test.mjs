#!/usr/bin/env node
// Runs pgTAP tests in supabase/tests/*.test.sql against a fresh database with all migrations + demo seed applied.
// Usage: DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres node scripts/db-test.mjs
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ADMIN_URL, ROOT, applyFile, applyShimAndMigrations, createFreshDatabase, hasPsql, psql } from './db-lib.mjs';

if (!hasPsql()) {
  console.error('psql not found on PATH — install PostgreSQL client tools.');
  process.exit(2);
}

const dbName = process.env.DB_TEST_NAME ?? 'da_test';
console.log(`Creating fresh database ${dbName} …`);
const url = createFreshDatabase(ADMIN_URL, dbName);
applyShimAndMigrations(url);
psql(url, ['-c', 'create extension if not exists pgtap']);

const seed = path.join(ROOT, 'supabase', 'seed', 'seed.sql');
console.log('→ seed');
applyFile(url, seed);

const testDir = path.join(ROOT, 'supabase', 'tests');
const files = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.sql'))
  .sort();

let failed = 0;
let total = 0;
for (const f of files) {
  const res = psql(url, ['-At', '-f', path.join(testDir, f)], { allowFailure: true });
  const out = `${res.stdout}\n${res.stderr}`;
  const lines = out.split('\n').filter((l) => /^(ok|not ok)\b/.test(l));
  const bad = lines.filter((l) => l.startsWith('not ok'));
  total += lines.length;
  failed += bad.length;
  console.log(`${bad.length === 0 && res.status === 0 ? '✓' : '✗'} ${f} — ${lines.length - bad.length}/${lines.length} ok`);
  if (bad.length || res.status !== 0) {
    console.log(out);
  }
}
console.log(`\n${total - failed}/${total} assertions passed across ${files.length} files`);
process.exit(failed === 0 ? 0 : 1);
