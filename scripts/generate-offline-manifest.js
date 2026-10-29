#!/usr/bin/env node
/** Emit a build-specific service-worker dependency manifest after next build. */
const fs = require('fs');
const path = require('path');

const ROUTES = ['/', '/tasks', '/lists', '/notes', '/calendar', '/reminders', '/zen-insights', '/friends'];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : [filename];
  });
}

function generate(root) {
  const buildId = fs.readFileSync(path.join(root, '.next', 'BUILD_ID'), 'utf8').trim();
  const staticDirectory = path.join(root, '.next', 'static');
  const assets = walk(staticDirectory).map((filename) =>
    '/_next/static/' + path.relative(staticDirectory, filename).split(path.sep).join('/'),
  ).filter((filename) => /\.(?:js|css|woff2?|ttf|otf|png|svg|webp|ico)$/.test(filename));
  // Pages alone are insufficient: even never-opened routes need their lazy
  // chunks and fonts cached before the user disconnects.
  const manifest = { version: buildId, routes: ROUTES, assets: [...new Set([...ROUTES, '/manifest.webmanifest', ...assets])].sort() };
  const contents = `self.__ZEN_PRECACHE = ${JSON.stringify(manifest)};\n`;
  fs.writeFileSync(path.join(root, 'public', 'offline-manifest.js'), contents);
  // next export copies public before this post-build step; update the bundle too.
  const output = path.join(root, 'out');
  if (fs.existsSync(output)) fs.writeFileSync(path.join(output, 'offline-manifest.js'), contents);
  console.log(`Prepared ${manifest.assets.length} offline assets for build ${buildId}`);
  return manifest;
}

if (require.main === module) generate(path.resolve(__dirname, '..'));
module.exports = { generate };
