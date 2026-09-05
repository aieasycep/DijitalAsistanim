#!/usr/bin/env node
// Expo validation without a native toolchain:
//  1. resolve app.config.ts and assert identity fields
//  2. run config plugins via `expo config --type introspect` (catches plugin errors)
//  3. `expo-doctor` (dependency compatibility)
//  4. `expo export --platform ios --platform android` bundling dry-run is skipped in CI when too slow; set EXPO_VALIDATE_EXPORT=1 to enable
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  EXPO_NO_TELEMETRY: '1',
  CI: '1',
  APP_ENV: process.env.APP_ENV ?? 'preview',
};

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: APP, encoding: 'utf8', env, ...opts });
  if (res.status !== 0) {
    console.error(res.stdout);
    console.error(res.stderr);
    throw new Error(`${cmd} ${args.join(' ')} failed`);
  }
  return res.stdout;
}

console.log('→ expo config (introspect)');
const json = run('npx', ['expo', 'config', '--type', 'introspect', '--json']);
const start = json.indexOf('{');
const config = JSON.parse(json.slice(start));
const required = {
  scheme: 'dijitalasistan',
  'ios.bundleIdentifier': 'com.dijitalasistan.app',
  'android.package': 'com.dijitalasistan.app',
};
for (const [key, fallback] of Object.entries(required)) {
  const value = key.split('.').reduce((o, k) => (o ? o[k] : undefined), config);
  if (!value) throw new Error(`app config missing ${key} (expected e.g. ${fallback})`);
}
if (!Array.isArray(config.ios?.entitlements?.['com.apple.security.application-groups']))
  throw new Error('iOS app group entitlement missing');
console.log(
  `✓ config ok: ${config.name} ${config.version} · scheme ${config.scheme} · ${config.ios.bundleIdentifier}`,
);

console.log('→ expo-doctor');
try {
  execFileSync('npx', ['expo-doctor'], { cwd: APP, stdio: 'inherit', env });
} catch {
  console.error('expo-doctor reported issues');
  process.exit(1);
}

if (process.env.EXPO_VALIDATE_EXPORT === '1') {
  console.log('→ expo export (bundle dry-run)');
  run(
    'npx',
    ['expo', 'export', '--platform', 'ios', '--output-dir', '.expo-export-check', '--no-minify'],
    { stdio: 'inherit' },
  );
}
console.log('✓ expo validation passed');
