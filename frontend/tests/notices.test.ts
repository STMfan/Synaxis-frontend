import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependencyNotices, prepareDependencyNotices } from '../scripts/prepare-notices.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function fixture(t: { after(callback: () => void): void }) {
  const output = resolve(root, 'test-results'); mkdirSync(output, { recursive: true });
  const base = mkdtempSync(join(output, 'notices-')); t.after(() => rmSync(base, { recursive: true, force: true }));
  function put(name: string, value: string) { const p = join(base, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, value); }
  put('package-lock.json', JSON.stringify({ packages: { '': {}, 'node_modules/fixture-ui': { version: '1.2.3' }, 'node_modules/dev-only': { version: '1.0', dev: true } } }));
  put('node_modules/fixture-ui/package.json', JSON.stringify({ name: 'fixture-ui', version: '1.2.3', license: 'MIT' }));
  return { base, put };
}

test('notices preserve full copyright/license and NOTICE, and checks reject stale generated assets', t => {
  const f = fixture(t);
  const full = 'MIT License\nCopyright (c) 2026 Synthetic Authors\nPermission is hereby granted, free of charge, to reproduce this synthetic test fixture.\n';
  f.put('node_modules/fixture-ui/LICENSE', full); f.put('node_modules/fixture-ui/NOTICE', 'Synthetic additional upstream notice retained verbatim with attribution and copyright.\n');
  prepareDependencyNotices(f.base);
  const result = readFileSync(join(f.base, 'public/licenses/Third-Party-NPM.txt'), 'utf8');
  assert.ok(result.includes(full.trim())); assert.match(result, /Synthetic additional upstream notice/); assert.ok(!result.includes('dev-only'));
  prepareDependencyNotices(f.base, true);
  f.put('public/licenses/Third-Party-NPM.txt', 'stale output');
  assert.throws(() => prepareDependencyNotices(f.base, true), /stale/);
});

test('a license declaration alone or a changed installed version blocks a build', t => {
  const f = fixture(t);
  f.put('node_modules/fixture-ui/LICENSE.spdx', 'SPDXVersion: SPDX-2.1\nPackageLicenseDeclared: MIT\nPackageCopyrightText: Synthetic Authors\n');
  assert.throws(() => dependencyNotices(f.base), /Missing complete license text/);
  f.put('node_modules/fixture-ui/package.json', JSON.stringify({ name: 'fixture-ui', version: '2.0.0', license: 'MIT' }));
  assert.throws(() => dependencyNotices(f.base), /does not match lock/);
});

test('real production inventory carries the complete Preact and Marked license texts', () => {
  const result = dependencyNotices(root), text = result['Third-Party-NPM.txt'];
  const manifest = JSON.parse(result['Third-Party-NPM.json']);
  for (const name of ['preact', 'marked']) {
    const filename = name === 'preact' ? 'LICENSE' : 'LICENSE.md';
    const license = readFileSync(join(root, 'node_modules', name, filename), 'utf8').replace(/\r\n/g, '\n').trim();
    assert.ok(text.includes(license), `${name}: full upstream license must survive bundling`);
    assert.ok(manifest.packages.some((p: { name: string }) => p.name === name));
  }
});
