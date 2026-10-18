/** Explicit public source boundary. This tool never walks the working folder as a whole. */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
if (rootIndex >= 0 && !args[rootIndex + 1]) throw new Error('--root requires a frontend directory');
const root = rootIndex >= 0 ? resolve(args.splice(rootIndex, 2)[1]) : resolve(import.meta.dirname, '..');
const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
const files = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', '.env.example', '.gitignore', 'README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE', '.github/workflows/frontend.yml'];
const directories = ['src', 'scripts', 'tests', 'contracts', 'docs', 'assets/branding', 'public', 'src-tauri/src', 'src-tauri/capabilities', 'src-tauri/icons', 'src-tauri/gen/android', 'src-tauri/plugins/secure-keystore'];
files.push(...['Cargo.toml', 'Cargo.lock', 'build.rs', 'tauri.conf.json', 'Info.plist'].map(name => `src-tauri/${name}`));
const excludedDirectories = new Set(['archive', 'test-results', 'releases', 'node_modules', 'target', '.git', '.cache', '.gradle', '.kotlin', '.tauri', 'build', '__pycache__', 'jniLibs', '.idea', '.vscode', 'examples', 'private-fonts']);
const generated = new Set(['tauri.settings.gradle', 'tauri.properties', 'tauri.build.gradle.kts', 'proguard-tauri.pro', '.cargo-ok', '.cargo_vcs_info.json']);
const forbiddenFiles = /(?:^|\/)(?:\.env(?!\.example$)[^/]*|keystore\.properties|key\.properties|local\.properties|[^/]+\.(?:key|pem|jks|keystore|p12|pfx|sqlite3?(?:-(?:wal|shm|journal))?|db(?:-(?:wal|shm|journal))?|log|pyc))$/i;
const privateFonts = /(?:^|\/)(?:oppo-sans-full\.woff2|dingtalk-jinbu\.woff2|local\.css|local)(?:\/|$)/i;
const textFiles = /\.(?:ts|tsx|js|mjs|cjs|json|md|txt|toml|lock|css|html|xml|svg|gradle|kts|kt|swift|rs|py|pyi|yml|yaml|properties|plist|pro|example|gitignore|editorconfig|bat)$|(?:^|\/)(?:LICENSE(?:[-.][\w.-]+)?|NOTICE(?:\.\w+)?|gradlew|Cargo\.toml\.orig)$/i;
// Binary resources are allowed by both location and format, never by extension
// alone. New resource classes require an explicit review of this boundary.
const binaryResources = [
  { path: /^(?:assets\/branding|public\/logos)\/[^/]+\.png$/, magic: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
  { path: /^src-tauri\/(?:icons\/.*|gen\/android\/app\/src\/main\/res\/.*)\.png$/, magic: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
  { path: /^src-tauri\/icons\/[^/]+\.ico$/, magic: Buffer.from([0, 0, 1, 0]) },
  { path: /^src-tauri\/icons\/[^/]+\.icns$/, magic: Buffer.from('icns') },
  { path: /^public\/fonts\/jetbrains-mono\.woff2$/, magic: Buffer.from('wOF2') },
  { path: /^public\/licenses\/DingTalk-JinBu-License\.pdf$/, magic: Buffer.from('%PDF-') },
  { path: /^src-tauri\/gen\/android\/gradle\/wrapper\/gradle-wrapper\.jar$/, magic: Buffer.from([80, 75, 3, 4]) },
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/,
  /\bsk-[A-Za-z0-9_-]{24,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];
const candidates = new Map();
const issues = [];
function add(source, destination) {
  if (destination.split('/').some(part => part === '.' || part === '..' || /[\\:\x00-\x1f\x7f]/.test(part))) throw new Error('Public source name is not portable');
  const entry = lstatSync(source);
  if (entry.isSymbolicLink()) throw new Error(`Public sources cannot contain links: ${destination}`);
  if (entry.isDirectory()) {
    for (const name of readdirSync(source).sort()) {
      if (excludedDirectories.has(name)) continue;
      add(resolve(source, name), `${destination}/${name}`);
    }
    return;
  }
  if (!entry.isFile()) throw new Error(`Unsupported public file: ${destination}`);
  if (generated.has(destination.split('/').at(-1))) return;
  if (/\/gen\/android\/app\/src\/main\/(?:java\/.*\/generated\/|assets\/tauri\.conf\.json$)/.test(destination)) return;
  // Fonts with restricted redistribution are supplied by users through local()
  // only. Their private copies must never enter either source exports or dist.
  if (privateFonts.test(destination)) { issues.push(`Restricted font found in publication input: ${destination}`); return; }
  if (forbiddenFiles.test(destination)) {
    // Android machine-specific files are ignored even when present locally.
    if (/\/gen\/android\/(?:keystore|key|local)\.properties$/.test(destination)) return;
    issues.push(`Private file found in publication input: ${destination}`); return;
  }
  const text = textFiles.test(destination) || ['.gitignore', '.editorconfig'].includes(basename(destination));
  const resource = binaryResources.find(rule => rule.path.test(destination));
  if (!text && !resource) { issues.push(`Unsupported public file type: ${destination}`); return; }
  if (entry.size > 16 * 1024 * 1024) { issues.push(`Oversized public file: ${destination}`); return; }
  const bytes = readFileSync(source);
  // ASCII credential formats can also occur in image/PDF/archive metadata.
  if (secretPatterns.some(pattern => pattern.test(bytes.toString('latin1')))) issues.push(`Potential secret in ${destination}; inspect locally (value withheld)`);
  if (text) {
    let body;
    try { body = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { issues.push(`Public text must be UTF-8: ${destination}`); return; }
    if (body.includes('\0')) { issues.push(`Binary content in public text: ${destination}`); return; }
    if (/192\.168\.1\.22|(?:[A-Z]:[\\/]+(?:Users|Projects|AndroidSDK)[\\/])/i.test(body)) issues.push(`Personal machine/server binding in ${destination}`);
  } else if (!bytes.subarray(0, resource.magic.length).equals(resource.magic)) {
    issues.push(`Invalid public resource format: ${destination}`); return;
  }
  candidates.set(destination, { source, bytes: entry.size });
}

for (const name of files) {
  if (!existsSync(resolve(root, name))) { issues.push(`Missing public source: ${name}`); continue; }
  add(resolve(root, name), name);
}
for (const name of directories) add(resolve(root, name), name);
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
if (tauri.version !== pkg.version || !cargo.includes(`version = "${pkg.version}"`)) throw new Error('App version metadata is inconsistent');
if (!pkg.license || pkg.license === 'UNLICENSED') issues.push('Frontend license must be explicitly selected before publication');
if ([...candidates.values()].reduce((sum, file) => sum + file.bytes, 0) > 64 * 1024 * 1024) issues.push('Public source exceeds 64 MB');
if (new Set([...candidates.keys()].map(name => name.toLowerCase())).size !== candidates.size) issues.push('Public source names collide on case-insensitive filesystems');
if (issues.length) {
  for (const issue of issues) console.error(issue);
  console.error('Publication blocked; no export was written.');
  process.exit(1);
}

if (args.length === 1 && args[0] === '--check') {
  console.log(`PASS: ${candidates.size} allowlisted public files (${([...candidates.values()].reduce((n, f) => n + f.bytes, 0) / 1e6).toFixed(2)} MB), secret formats, portable paths and app versions checked. Git history is outside this check.`);
} else if (args.length === 2 && args[0] === '--output') {
  const output = resolve(args[1]);
  if (existsSync(output)) throw new Error('Export destination already exists; choose a new empty path');
  // Refuse putting an export inside one of its own source trees.
  for (const directory of directories) {
    const sourceRoot = comparable(resolve(root, directory));
    if (comparable(output) === sourceRoot || comparable(output).startsWith(sourceRoot + sep)) throw new Error('Export destination overlaps a source directory');
  }
  for (const { source } of candidates.values()) {
    if (comparable(source) === comparable(output) || comparable(source).startsWith(comparable(output) + sep)) throw new Error('Export destination overlaps sources');
  }
  mkdirSync(output, { recursive: true });
  for (const [destination, { source }] of candidates) {
    const target = resolve(output, destination);
    if (relative(output, target).startsWith('..')) throw new Error('Export escaped its destination');
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { dereference: false });
  }
  console.log(`Exported ${candidates.size} vetted source files to ${output}`);
} else {
  throw new Error('Usage: node scripts/publication.mjs [--root <frontend-directory>] --check | --output <new-directory>');
}
