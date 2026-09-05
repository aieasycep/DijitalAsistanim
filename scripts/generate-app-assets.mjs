#!/usr/bin/env node
// Generates the app icon pipeline (iOS icon, Android adaptive foreground + monochrome, splash icons,
// notification icon, favicon, web OG) from the original vector mark in apps/mobile/assets/brand/mark.svg.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'apps/mobile/assets');
const mark = readFileSync(path.join(ASSETS, 'brand/mark.svg'));

const sparkOnly = (color, opacity = 1) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <path fill="${color}" fill-opacity="${opacity}" d="M512 236c14 0 26 9 30 22l38 118c8 25 28 45 53 53l118 38c13 4 22 16 22 30s-9 26-22 30l-118 38c-25 8-45 28-53 53l-38 118c-4 13-16 22-30 22s-26-9-30-22l-38-118c-8-25-28-45-53-53l-118-38c-13-4-22-16-22-30s9-26 22-30l118-38c25-8 45-28 53-53l38-118c4-13 16-22 30-22z"/>
  <path fill="${color}" fill-opacity="${opacity}" d="M744 216c6 0 11 4 13 10l12 37c3 9 10 16 19 19l37 12c6 2 10 7 10 13s-4 11-10 13l-37 12c-9 3-16 10-19 19l-12 37c-2 6-7 10-13 10s-11-4-13-10l-12-37c-3-9-10-16-19-19l-37-12c-6-2-10-7-10-13s4-11 10-13l37-12c9-3 16-10 19-19l12-37c2-6 7-10 13-10z"/>
</svg>`);

const adaptiveForeground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g transform="translate(512 512) scale(0.62) translate(-512 -512)">${sparkOnly('#FFFFFF').toString().replace(/<\/?svg[^>]*>/g, '')}</g>
</svg>`);

const splashLight = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" rx="228" fill="#5B5CE2"/>
  ${sparkOnly('#FFFFFF').toString().replace(/<\/?svg[^>]*>/g, '')}
</svg>`);

async function write(name, input, size, opts = {}) {
  const out = path.join(ASSETS, name);
  mkdirSync(path.dirname(out), { recursive: true });
  let img = sharp(input, { density: 384 }).resize(size, size, { fit: 'contain', background: opts.background ?? { r: 0, g: 0, b: 0, alpha: 0 } });
  if (opts.flatten) img = img.flatten({ background: opts.flatten });
  await img.png().toFile(out);
  console.log(`✓ ${name} (${size}px)`);
}

await write('icon.png', mark, 1024, { flatten: '#5B5CE2' });
await write('adaptive-icon.png', adaptiveForeground, 1024);
await write('adaptive-icon-mono.png', adaptiveForeground, 1024);
await write('splash-icon.png', splashLight, 512);
await write('splash-icon-dark.png', splashLight, 512);
await write('notification-icon.png', sparkOnly('#FFFFFF'), 96);
await write('favicon.png', mark, 64, { flatten: '#5B5CE2' });
await write('brand/mark-1024.png', mark, 1024, { flatten: '#5B5CE2' });

// widget preview thumbnail (used by expo-widgets placeholder & marketing)
writeFileSync(path.join(ASSETS, 'brand/README.md'), `# Brand assets\n\nOriginal vector mark: mark.svg (indigo tile + assistant spark). Regenerate PNGs with \`node scripts/generate-app-assets.mjs\`.\n`);
console.log('done');
