import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

// Both files are reviewable public contracts. Never import/run the live backend,
// read dotenv, or contact a configured server from a build/PR check.
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--against')) throw new Error('Usage: node scripts/check-contract.mjs [--against openapi.json]');
const baselineBytes = readFileSync(resolve(root, 'contracts/openapi.json'));
const baseline = JSON.parse(baselineBytes.toString('utf8'));
if (!args.length) {
  const source = JSON.parse(readFileSync(resolve(root, 'contracts/source.json'), 'utf8'));
  if (createHash('sha256').update(baselineBytes).digest('hex') !== source.sha256) throw new Error('Reviewed contract digest changed; review and update contracts/source.json');
  console.log(`PASS: reviewed API baseline integrity (${baseline.info.version}); upstream ${source.revision}. Use --against <openapi.json> to check a backend version for compatibility.`);
  process.exit(0);
}
const candidate = JSON.parse(readFileSync(resolve(args[1]), 'utf8'));
const annotations = new Set(['title', 'description', 'summary', 'example', 'examples', 'externalDocs']);
function wire(value, members = false) {
  if (Array.isArray(value)) return value.map(item => wire(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => members || !annotations.has(key)).map(key => [key,
    !members && ['default', 'const', 'enum'].includes(key) ? value[key] : wire(value[key], !members && ['properties', 'patternProperties', '$defs', 'schemas'].includes(key)),
  ]));
}
const projection = doc => wire({ paths: doc.paths, components: doc.components, security: doc.security });
if (!isDeepStrictEqual(projection(baseline), projection(candidate))) {
  console.error('API wire contract changed: review parameters, request/response fields, authentication and SSE schemas, then update contracts/openapi.json. Version strings and prose are ignored; additions also require review.');
  process.exit(1);
}
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const operations = Object.values(candidate.paths).reduce((n, item) => n + Object.keys(item).filter(key => methods.has(key)).length, 0);
console.log(`PASS: ${operations} API operations, wire schemas, authentication and SSE match the reviewed client baseline (${candidate.info.version}). Runtime semantics still require integration tests.`);
