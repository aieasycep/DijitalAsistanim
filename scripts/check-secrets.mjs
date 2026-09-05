#!/usr/bin/env node
// Fails when something that looks like a real credential is committed, or when a server-only secret
// name is referenced from client bundles (apps/mobile, apps/web client code, packages/ui, packages/api-client).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', '.expo', 'dist', 'build', 'coverage', 'ios', 'android', '.turbo', 'design-reference']);
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.sql', '.md', '.yml', '.yaml', '.toml', '.env', '.example', '.kt', '.swift', '.plist']);

const SECRET_PATTERNS = [
  { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI key', re: /sk-(proj-|live-)?[A-Za-z0-9]{32,}/ },
  { name: 'Google OAuth secret', re: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Supabase service role JWT', re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: 'RevenueCat secret', re: /sk_[A-Za-z0-9]{24,}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'AWS key', re: /AKIA[0-9A-Z]{16}/ },
];

const SERVER_ONLY_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'MICROSOFT_OAUTH_CLIENT_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'REVENUECAT_WEBHOOK_SECRET',
  'REVENUECAT_SECRET_API_KEY',
  'ELEVENLABS_API_KEY',
  'DEEPGRAM_API_KEY',
  'VOYAGE_API_KEY',
  'EXPO_ACCESS_TOKEN',
  'SENTRY_AUTH_TOKEN',
  'INTERNAL_FUNCTION_SECRET',
  'CRON_SECRET',
];
const CLIENT_DIRS = ['apps/mobile', 'packages/ui', 'packages/api-client', 'packages/design-tokens', 'packages/i18n', 'packages/domain', 'packages/validation', 'apps/web/src'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(path.extname(entry)) || entry.startsWith('.env')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const problems = [];

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel === 'scripts/check-secrets.mjs') continue;
  const content = readFileSync(file, 'utf8');
  for (const { name, re } of SECRET_PATTERNS) {
    const m = content.match(re);
    if (m && !/example|placeholder|YOUR-|<.*>/i.test(m[0])) problems.push(`${rel}: possible ${name} committed`);
  }
  if (CLIENT_DIRS.some((d) => rel.startsWith(d)) && !rel.endsWith('.md') && !rel.includes('.env.example')) {
    for (const name of SERVER_ONLY_NAMES) {
      if (content.includes(`process.env.${name}`) || content.includes(`Deno.env.get('${name}')`)) {
        problems.push(`${rel}: references server-only secret ${name} from client code`);
      }
    }
  }
}

if (problems.length) {
  console.error('Secret check failed:\n' + problems.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ secret scan clean (${files.length} files)`);
