#!/usr/bin/env node
/**
 * Capacitor static export build script.
 *
 * Next.js Route Handlers (route.ts) and server-only dynamic pages are not
 * compatible with `output: 'export'`. This script temporarily hides those
 * directories (prefixing them with `_` so Next.js ignores them) during the
 * static export build, then restores them afterwards.
 *
 * Excluded directories:
 *   - src/app/api          — Route Handlers require a live server
 *   - src/app/lists/share  — Dynamic page requiring Supabase server credentials
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// [source, hidden] pairs — directories to hide during the Capacitor build
const dirs = [
  [
    path.join(root, 'src', 'app', 'api'),
    path.join(root, 'src', 'app', '_api'),
  ],
  [
    path.join(root, 'src', 'app', 'lists', 'share'),
    path.join(root, 'src', 'app', 'lists', '_share'),
  ],
];

const hidden = [];

function moveDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
  fs.rmSync(src, { recursive: true, force: true });
}

function restore() {
  for (const [src, dest] of hidden) {
    if (fs.existsSync(dest)) {
      moveDir(dest, src);
      console.log(`Restored ${path.relative(root, src)}`);
    }
  }
}

process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(1); });
process.on('SIGTERM', () => { restore(); process.exit(1); });

for (const [src, dest] of dirs) {
  if (fs.existsSync(src)) {
    moveDir(src, dest);
    hidden.push([src, dest]);
    console.log(`Temporarily hidden ${path.relative(root, src)} for static export`);
  }
}

try {
  execSync('next build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CAPACITOR_BUILD: 'true' },
  });
} finally {
  restore();
}
