import { spawnSync } from 'node:child_process';
const target = process.argv[2];
const platform = { win: 'win32', mac: 'darwin', linux: 'linux' }[target];
if (process.platform !== platform) { console.error(`build:${target} must run on ${platform}. Run this command on the target OS with its native WebView toolchain installed.`); process.exit(1); }
const cli = process.platform === 'win32' ? 'node_modules/@tauri-apps/cli/tauri.js' : 'node_modules/@tauri-apps/cli/tauri.js';
const bundle = { win: 'nsis', mac: 'app,dmg', linux: 'deb' }[target];
const result = spawnSync(process.execPath, [cli, 'build', '--bundles', bundle], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const check = spawnSync(process.execPath, ['scripts/check-size.mjs', 'native'], { stdio: 'inherit' }); process.exit(check.status || 0);
