import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prepareDependencyNotices } from './prepare-notices.mjs';
const root = resolve(import.meta.dirname, '..');
prepareDependencyNotices(root);
// Include the project's grant and resource boundaries in binary distributions.
mkdirSync(join(root, 'public/licenses'), { recursive: true });
copyFileSync(join(root, 'LICENSE'), join(root, 'public/licenses/Synaxis-MIT.txt'));
copyFileSync(join(root, 'NOTICE'), join(root, 'public/licenses/Synaxis-NOTICE.txt'));
const cli = join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const sources = readdirSync(join(root, 'assets/branding')).filter(name => /^\d\d-.*\.png$/.test(name)).sort();
if (sources.length !== 9 || sources[0] !== '00-synaxis.png') throw new Error('Expected nine source logos in assets/branding');
const hash = createHash('sha256').update(readFileSync(join(root, 'scripts/icon-source.json')));
hash.update(readFileSync(join(root, 'node_modules/@tauri-apps/cli/package.json')));
for (const name of sources) hash.update(readFileSync(join(root, 'assets/branding', name)));
const fingerprint = hash.digest('hex');
const stamp = join(root, '.cache/assets.sha256');
const res = join(root, 'src-tauri/gen/android/app/src/main/res');
const complete = sources.every(name => existsSync(join(root, 'public/logos', name))) && existsSync(join(root, 'src-tauri/icons/icon.ico')) && (!existsSync(res) || existsSync(join(res, 'mipmap-anydpi-v26/ic_launcher.xml')));
if (complete && existsSync(stamp) && readFileSync(stamp, 'utf8') === fingerprint) { console.log('Branding assets are current (web, desktop, Android).'); process.exit(0); }
function icon(input, output, custom = false) {
  const result = spawnSync(process.execPath, [cli, 'icon', input, '--output', output, ...(custom ? ['--png', '128'] : [])], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Icon generation failed');
}
mkdirSync(join(root, 'public/logos'), { recursive: true });
for (const name of sources) {
  const output = join(root, '.cache/logos', name.slice(0, -4));
  icon(join(root, 'assets/branding', name), output, true);
  copyFileSync(join(output, '128x128.png'), join(root, 'public/logos', name));
}
icon(join(root, 'scripts/icon-source.json'), join(root, 'src-tauri/icons'));
// The CLI writes directly into an initialized Android project, and otherwise
// puts its Android resources under the requested icon output directory.
const android = join(root, 'src-tauri/icons/android');
if (existsSync(res) && existsSync(android)) cpSync(android, res, { recursive: true });
if (existsSync(res) && !existsSync(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'))) throw new Error('Android adaptive icon was not generated');
writeFileSync(stamp, fingerprint);
console.log('Prepared UI, desktop and Android icons from assets/branding.');
