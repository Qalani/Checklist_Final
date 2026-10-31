#!/usr/bin/env node
// Native Android builds do not install or bundle the web application.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const android = fileURLToPath(new URL('../android/', import.meta.url));
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', process.argv.slice(2), {
  cwd: android,
  stdio: 'inherit',
  shell: windows,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
