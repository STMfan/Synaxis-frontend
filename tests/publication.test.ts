import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'scripts/publication.mjs');
const version = '0.0.0-synthetic-fixture';
// This license applies exclusively to the authored synthetic files below. The
// actual frontend source/license is never copied, relicensed or used as input.
const license = `MIT License

Copyright (c) 2026 Synthetic Fixture Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function put(base: string, path: string, text: string) {
  const destination = resolve(base, path);
  assert.ok(destination.startsWith(resolve(base) + sep));
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, text);
}

function syntheticProject(base: string) {
  const frontend = join(base, 'frontend');
  const pkg = { name: 'synthetic-publication-fixture', version, type: 'module', license: 'MIT' };
  const openapi = JSON.stringify({ openapi: '3.1.0', info: { title: 'Synthetic API', version }, paths: {} });
  const files: Record<string, string> = {
    'package.json': JSON.stringify(pkg),
    'package-lock.json': JSON.stringify({ ...pkg, lockfileVersion: 3, packages: { '': pkg } }),
    'tsconfig.json': '{}',
    'vite.config.ts': '// SPDX-License-Identifier: MIT\nexport default {};\n',
    'index.html': '<!doctype html><title>Synthetic test fixture</title>',
    '.env.example': 'VITE_API_BASE_URL=http://127.0.0.1:5667\n',
    '.gitignore': '.cache/\n.secrets/\nnode_modules/\ntest-results/\n',
    'README.md': '# Synthetic publication fixture\n\nThis is authored test data, not the application.\n',
    'CHANGELOG.md': '# Synthetic changes\n',
    'LICENSE': license,
    'NOTICE': 'Only the synthetic test project is MIT licensed by this fixture.\n',
    'src/synthetic.ts': '// SPDX-License-Identifier: MIT\nexport const synthetic = true;\n',
    'scripts/synthetic.mjs': '// SPDX-License-Identifier: MIT\nconsole.log("synthetic fixture");\n',
    'tests/synthetic.test.ts': '// SPDX-License-Identifier: MIT\nexport {};\n',
    'contracts/openapi.json': openapi,
    'docs/synthetic.md': '# Synthetic maintenance guide\n',
    'assets/branding/synthetic.svg': '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>',
    'public/synthetic.txt': 'A public synthetic asset.\n',
    'src-tauri/Cargo.toml': `[package]\nname = "synthetic-fixture"\nversion = "${version}"\nlicense = "MIT"\n`,
    'src-tauri/Cargo.lock': '# Synthetic lock placeholder; no dependencies\nversion = 4\n',
    'src-tauri/build.rs': '// SPDX-License-Identifier: MIT\nfn main() {}\n',
    'src-tauri/tauri.conf.json': JSON.stringify({ version }),
    'src-tauri/Info.plist': '<?xml version="1.0"?><plist version="1.0"><dict/></plist>',
    'src-tauri/src/main.rs': '// SPDX-License-Identifier: MIT\nfn main() {}\n',
    'src-tauri/capabilities/default.json': '{}',
    'src-tauri/icons/synthetic.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'src-tauri/gen/android/settings.gradle.kts': '// SPDX-License-Identifier: MIT\nrootProject.name = "Synthetic"\n',
    'src-tauri/plugins/secure-keystore/LICENSE-MIT': license,
  };
  for (const [path, text] of Object.entries(files)) put(frontend, path, text);
  put(frontend, '.github/workflows/frontend.yml', 'name: Synthetic fixture\non: workflow_dispatch\njobs: {}\n');
  return frontend;
}

function run(frontend: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, '--root', frontend, ...args], { encoding: 'utf8' });
}

test('publication CLI exports only vetted synthetic sources and rejects unsafe inputs', async t => {
  const outputs = resolve(root, 'test-results'); mkdirSync(outputs, { recursive: true });
  const sandbox = mkdtempSync(join(outputs, 'publication-'));
  assert.ok(sandbox.startsWith(outputs + sep));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  let number = 0;
  function project() {
    const workspace = join(sandbox, `case-${++number}`);
    return { workspace, frontend: syntheticProject(workspace), output: join(sandbox, `export-${number}`) };
  }

  await t.test('export omits caches, secrets and generated Android files; the export passes a fresh check', () => {
    const fixture = project();
    const excluded = [
      '.cache/private-result.json', '.secrets/credentials.json', 'test-results/private-report.json',
      'src/.cache/private-result.json', 'src-tauri/gen/android/.gradle/cache.bin',
      'src-tauri/gen/android/local.properties', 'src-tauri/gen/android/keystore.properties',
      'src-tauri/gen/android/tauri.properties', 'src-tauri/gen/android/tauri.settings.gradle',
      'src-tauri/gen/android/app/tauri.build.gradle.kts',
      'src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk',
      'src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/libsynthetic.so',
      'src-tauri/gen/android/app/src/main/java/cn/synthetic/generated/Bindings.kt',
    ];
    for (const path of excluded) put(fixture.frontend, path, 'Synthetic private/generated sentinel.\n');
    const exported = run(fixture.frontend, '--output', fixture.output);
    assert.equal(exported.status, 0, exported.stderr);
    for (const path of excluded) assert.equal(existsSync(join(fixture.output, path)), false, path);
    assert.equal(readFileSync(join(fixture.output, 'src/synthetic.ts'), 'utf8'), '// SPDX-License-Identifier: MIT\nexport const synthetic = true;\n');
    assert.ok(existsSync(join(fixture.output, '.github/workflows/frontend.yml')));
    assert.ok(existsSync(join(fixture.output, 'contracts/openapi.json')));
    assert.equal(existsSync(join(fixture.output, 'backend')), false);
    assert.equal(existsSync(join(fixture.output, 'frontend')), false);
    assert.equal(readFileSync(join(fixture.output, 'README.md'), 'utf8'), readFileSync(join(fixture.frontend, 'README.md'), 'utf8'));
    const checked = run(fixture.output, '--check');
    assert.equal(checked.status, 0, checked.stderr);
  });

  await t.test('credential formats and private-key markers fail before export without echoing their values', () => {
    // Synthetic strings intentionally assembled at runtime so these tests do not
    // themselves embed secret-like literals into a public source export.
    const secrets = ['sk-' + 'synthetic'.repeat(6), '-----BEGIN ' + 'PRIVATE KEY-----\n' + 'synthetic-key-body\n' + '-----END ' + 'PRIVATE KEY-----'];
    for (const secret of secrets) {
      const fixture = project();
      put(fixture.frontend, 'src/unsafe.txt', secret);
      const result = run(fixture.frontend, '--output', fixture.output);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Potential secret/);
      assert.equal((result.stdout + result.stderr).includes(secret), false, 'secret value must be withheld');
      assert.equal(existsSync(fixture.output), false);
    }
  });

  await t.test('private configuration and databases inside public inputs fail closed', () => {
    for (const path of ['src/.env', 'public/runtime.sqlite3', 'public/runtime.sqlite-wal', 'public/runtime.sqlite3-wal', 'public/runtime.sqlite3-shm', 'public/runtime.db-wal', 'public/runtime.db-shm', 'public/runtime.db-journal']) {
      const fixture = project();
      put(fixture.frontend, path, 'Synthetic private input.\n');
      const result = run(fixture.frontend, '--output', fixture.output);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Private file found/);
      assert.equal(existsSync(fixture.output), false);
      const checked = run(fixture.frontend, '--check');
      assert.equal(checked.status, 1);
    }
  });

  await t.test('unknown resources and binary content disguised as text cannot enter either publication mode', () => {
    for (const [path, data] of [
      ['public/unknown.bin', 'sk-' + 'synthetic'.repeat(6)],
      ['src/unknown.custom', 'Synthetic unknown input'],
      ['src/binary.ts', Buffer.from([0xff, 0xfe, 0x01])],
      ['src/null.txt', 'not\0text'],
      ['public/logos/invalid.png', 'not a PNG'],
    ] as const) {
      const fixture = project();
      const target = join(fixture.frontend, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data);
      for (const args of [['--check'], ['--output', fixture.output]]) {
        const result = run(fixture.frontend, ...args);
        assert.equal(result.status, 1, path);
        assert.match(result.stderr, /Unsupported public file type|Public text must be UTF-8|Binary content in public text|Invalid public resource format/);
        assert.equal(existsSync(fixture.output), false);
      }
    }
  });

  await t.test('allowed binary resource metadata is scanned for credentials without logging the value', () => {
    const fixture = project(), secret = 'sk-' + 'synthetic'.repeat(6);
    const path = join(fixture.frontend, 'public/logos/metadata.png'); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(secret)]));
    for (const args of [['--check'], ['--output', fixture.output]]) {
      const result = run(fixture.frontend, ...args);
      assert.equal(result.status, 1); assert.match(result.stderr, /Potential secret/);
      assert.ok(!(result.stdout + result.stderr).includes(secret)); assert.equal(existsSync(fixture.output), false);
    }
  });

  await t.test('restricted redistributable-font filenames are rejected even when the bytes are synthetic', () => {
    const fixture = project();
    put(fixture.frontend, 'public/fonts/oppo-sans-full.woff2', 'Synthetic bytes, not a real font.');
    const result = run(fixture.frontend, '--output', fixture.output);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Restricted font found/);
    assert.equal(existsSync(fixture.output), false);
  });

  await t.test('both license text and an explicit license selection are required', () => {
    const missing = project();
    rmSync(join(missing.frontend, 'LICENSE'));
    const missingResult = run(missing.frontend, '--output', missing.output);
    assert.equal(missingResult.status, 1);
    assert.match(missingResult.stderr, /Missing public source: LICENSE/);
    assert.equal(existsSync(missing.output), false);
    const unset = project();
    put(unset.frontend, 'package.json', JSON.stringify({ name: 'synthetic-fixture', version, license: 'UNLICENSED' }));
    const unsetResult = run(unset.frontend, '--output', unset.output);
    assert.equal(unsetResult.status, 1);
    assert.match(unsetResult.stderr, /license must be explicitly selected/);
    assert.equal(existsSync(unset.output), false);
  });

  await t.test('symbolic links are rejected without dereferencing their targets', context => {
    const fixture = project();
    put(fixture.workspace, 'outside.txt', 'Synthetic link target outside the public tree.');
    try {
      symlinkSync(join(fixture.workspace, 'outside.txt'), join(fixture.frontend, 'src/linked.txt'), 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes((error as { code?: string }).code || '')) {
        context.skip('This host does not permit creating symbolic links.'); return;
      }
      throw error;
    }
    const result = run(fixture.frontend, '--output', fixture.output);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot contain links/);
    assert.equal(existsSync(fixture.output), false);
  });

  await t.test('existing destinations and destinations inside a source tree are refused', () => {
    const fixture = project();
    mkdirSync(fixture.output);
    put(fixture.output, 'sentinel.txt', 'Do not overwrite.');
    const existing = run(fixture.frontend, '--output', fixture.output);
    assert.equal(existing.status, 1);
    assert.match(existing.stderr, /destination already exists/);
    assert.equal(readFileSync(join(fixture.output, 'sentinel.txt'), 'utf8'), 'Do not overwrite.');
    const inside = join(fixture.frontend, 'src/exported');
    const overlapping = run(fixture.frontend, '--output', inside);
    assert.equal(overlapping.status, 1);
    assert.match(overlapping.stderr, /overlaps a source directory/);
    assert.equal(existsSync(inside), false);
  });
});
