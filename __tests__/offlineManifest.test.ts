/** @jest-environment node */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { generate } = require('../scripts/generate-offline-manifest');

test('build manifest includes all route chunks, fonts, and an update-specific build id in web and native output', () => {
  const root = mkdtempSync(join(tmpdir(), 'zen-offline-manifest-'));
  try {
    for (const directory of ['public', 'out', '.next/static/chunks/app/notes', '.next/static/media']) mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, '.next/BUILD_ID'), 'release-123');
    writeFileSync(join(root, '.next/static/chunks/app/notes/page.js'), 'page');
    writeFileSync(join(root, '.next/static/media/body.woff2'), 'font');
    writeFileSync(join(root, '.next/static/chunks/app/notes/page.js.map'), 'source map');
    const manifest = generate(root);
    expect(manifest.version).toBe('release-123');
    expect(manifest.assets).toEqual(expect.arrayContaining(['/notes', '/_next/static/chunks/app/notes/page.js', '/_next/static/media/body.woff2']));
    expect(manifest.assets.some((asset: string) => asset.endsWith('.map'))).toBe(false);
    expect(readFileSync(join(root, 'out/offline-manifest.js'), 'utf8')).toBe(readFileSync(join(root, 'public/offline-manifest.js'), 'utf8'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
