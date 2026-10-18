import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(readFileSync(join(root, 'contracts/openapi.json'), 'utf8'));

test('reviewed API gate detects wire, authentication and SSE regressions without importing a backend', async t => {
  const outputs = resolve(root, 'test-results'); mkdirSync(outputs, { recursive: true });
  const sandbox = mkdtempSync(join(outputs, 'contract-'));
  assert.ok(sandbox.startsWith(outputs + (process.platform === 'win32' ? '\\' : '/')));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  mkdirSync(join(sandbox, 'scripts')); mkdirSync(join(sandbox, 'contracts'));
  // Exercise the real CLI with an isolated public baseline, never the working copy.
  copyFileSync(join(root, 'scripts/check-contract.mjs'), join(sandbox, 'scripts/check-contract.mjs'));
  const baseline = structuredClone(source);
  baseline.components.schemas.ContractGateFixture = {
    type: 'object',
    properties: {
      description: { type: 'string' }, title: { type: 'integer' },
      choice: { enum: [{ title: 'wire value', description: 'must be retained' }] },
    },
  };
  writeFileSync(join(sandbox, 'contracts/openapi.json'), JSON.stringify(baseline));
  function check(mutate: (candidate: any) => void) {
    const candidate = structuredClone(baseline); mutate(candidate);
    const path = join(sandbox, 'candidate.json'); writeFileSync(path, JSON.stringify(candidate));
    return spawnSync(process.execPath, [join(sandbox, 'scripts/check-contract.mjs'), '--against', path], { encoding: 'utf8' });
  }
  await t.test('version and prose changes are accepted', () => {
    const result = check(doc => {
      doc.info.version = 'future-preview';
      doc.paths['/v1/sessions'].post.description = 'Updated public description';
      doc.paths['/v1/sessions'].post.summary = 'Updated summary';
      doc.components.schemas.Profile.title = 'Updated schema heading';
    });
    assert.equal(result.status, 0, result.stderr);
  });
  const cases: [string, (candidate: any) => void][] = [
    ['operation removal', doc => { delete doc.paths['/v1/sessions'].post; }],
    ['authentication removal', doc => { doc.paths['/v1/sessions'].post.security = []; }],
    ['cursor parameter change', doc => { doc.paths['/v1/sessions/{session_id}/events'].get.parameters.find((p: any) => p.name === 'after').schema.minimum = 1; }],
    ['response schema change', doc => { doc.paths['/v1/me'].get.responses['200'].content['application/json'].schema = { type: 'string' }; }],
    ['SSE event removal', doc => { delete doc.paths['/v1/sessions/{session_id}/events'].get['x-sse-event-schema'].discriminator.mapping.reasoning_delta; }],
    ['wire property named description', doc => { doc.components.schemas.ContractGateFixture.properties.description.type = 'integer'; }],
    ['wire property named title', doc => { doc.components.schemas.ContractGateFixture.properties.title.type = 'string'; }],
    ['annotation-like names inside enum values', doc => { doc.components.schemas.ContractGateFixture.properties.choice.enum[0].description = 'different wire value'; }],
  ];
  for (const [name, mutate] of cases) await t.test(name + ' requires review', () => {
    const result = check(mutate);
    assert.equal(result.status, 1, `Gate unexpectedly accepted ${name}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /API wire contract changed/);
  });
});
