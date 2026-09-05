// Shared helpers for database scripts (validate migrations, run pgTAP tests, seed).
// Uses psql from PATH. DATABASE_URL points at a superuser connection (local: postgres on 54329, CI: service container).
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ADMIN_URL = process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/postgres';

export function dbNameFromUrl(url) {
  return new URL(url).pathname.replace(/^\//, '') || 'postgres';
}

export function withDatabase(url, dbName) {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

export function psql(url, args, opts = {}) {
  const res = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-q', url, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
    ...opts,
  });
  if (res.status !== 0 && !opts.allowFailure) {
    throw new Error(`psql failed (${args.join(' ')}):\n${res.stdout}\n${res.stderr}`);
  }
  return res;
}

export function createFreshDatabase(adminUrl, dbName) {
  psql(adminUrl, ['-c', `drop database if exists "${dbName}" with (force)`], { allowFailure: true });
  psql(adminUrl, ['-c', `create database "${dbName}" template template0 encoding 'UTF8'`]);
  return withDatabase(adminUrl, dbName);
}

export function listMigrations() {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(dir, f));
}

export function applyFile(url, file) {
  psql(url, ['-f', file]);
}

export function applySql(url, sql) {
  psql(url, ['-c', sql]);
}

export function applyShimAndMigrations(url, { log = console.log } = {}) {
  const shim = path.join(ROOT, 'supabase', 'tests', 'setup', '00_supabase_shim.sql');
  log(`→ shim ${path.relative(ROOT, shim)}`);
  applyFile(url, shim);
  for (const m of listMigrations()) {
    log(`→ migration ${path.basename(m)}`);
    applyFile(url, m);
  }
}

export function hasPsql() {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function readSql(file) {
  return readFileSync(file, 'utf8');
}
