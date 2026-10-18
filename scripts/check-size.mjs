import { readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
async function list(dir) { const result = []; for (const e of await readdir(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) result.push(...await list(f)); else result.push({ file: f, bytes: (await stat(f)).size }); } return result; }
const mode = process.argv[2]; const result = await list(mode === 'web' ? 'dist' : 'src-tauri/target/release/bundle');
if (mode === 'web') { const total = result.reduce((n, f) => n + f.bytes, 0); console.log(`Web assets: ${(total / 1e6).toFixed(2)} MB`); if (total >= 40e6) throw new Error('Web assets exceed 40 MB budget'); }
else {
  const installers = result.filter(f => /\.(exe|msi|dmg|deb|rpm|AppImage)$/.test(f.file));
  if (!installers.length) throw new Error('No installer was produced');
  for (const f of installers) { console.log(`${f.file}: ${(f.bytes / 1e6).toFixed(2)} MB`); if (f.bytes >= 100e6) throw new Error('Installer exceeds 100 MB'); }
  const binary = process.platform === 'win32' ? 'src-tauri/target/release/synaxis-client.exe' : 'src-tauri/target/release/synaxis-client';
  const bytes = (await stat(binary)).size; if (bytes >= 100e6) throw new Error(`Executable exceeds 100 MB: ${bytes}`);
  await mkdir('test-results', { recursive: true }); await writeFile('test-results/native-size.json', JSON.stringify({ binary, bytes, installers }, null, 2));
}
