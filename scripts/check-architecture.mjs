import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const files = [];
async function walk(dir) { for (const e of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, e.name); if (e.isDirectory()) await walk(file); else files.push(file); } }
await walk('src');
for (const file of files.filter(f => /\.[tj]sx?$/.test(f))) {
  const source = await readFile(file, 'utf8');
  if (/\bAbortSignal\s*\.\s*(?:any|timeout)\s*\(|\bthrowIfAborted\s*\(/.test(source)) throw new Error(`Unsupported cancellation API for older system WebViews: ${file}`);
  if (file.includes(`${path.sep}ui${path.sep}`)) {
    if (/\bfetch\s*\(|@tauri-apps|XMLHttpRequest|EventSource|https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/.test(source)) throw new Error(`UI transport leak: ${file}`);
    for (const match of source.matchAll(/import\s+([^;]+?)\s+from\s+['"]([^'"]*webview[^'"]*)['"]/g)) if (!match[1].startsWith('type ') || !match[2].endsWith('/types')) throw new Error(`UI may import only the types contract: ${file}`);
  }
  if (file.includes(`${path.sep}webview${path.sep}`) && /from\s+['"][^'"]*\/ui\//.test(source)) throw new Error(`Bridge imports UI: ${file}`);
}
console.log('PASS: UI/bridge boundary, typed injection, centralized API configuration');
