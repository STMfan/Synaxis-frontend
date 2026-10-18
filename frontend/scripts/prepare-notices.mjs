/** Preserve the actual installed production dependency licenses, not SPDX summaries. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// These exact published packages omit a full LICENSE file. Their declared
// Apache option uses the same full license as the installed sibling project;
// retain the package's own SPDX/copyright data rather than inventing a grant.
const supplements = {
  '@mathjax/mathjax-newcm-font@4.1.3': { declared: 'Apache-2.0', sibling: '@mathjax/src', version: '4.1.3', license: 'LICENSE', copyright: 'ts/mathjax.ts' },
  '@mathjax/mathjax-tex-font@4.1.3': { declared: 'Apache-2.0', sibling: '@mathjax/src', version: '4.1.3', license: 'LICENSE', copyright: 'ts/mathjax.ts' },
  '@tauri-apps/plugin-http@2.8.0': { declared: 'MIT OR Apache-2.0', sibling: '@tauri-apps/api', version: '2.12.1', license: 'LICENSE-APACHE-2.0', copyright: 'LICENSE.spdx' },
};

export function dependencyNotices(root) {
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  const records = [], sections = [];
  for (const [location, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (!location.startsWith('node_modules/') || entry.dev) continue;
    if (location.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid locked package location');
    const directory = resolve(root, location);
    if (entry.optional && !existsSync(directory)) continue;
    const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    if (pkg.version !== entry.version || typeof pkg.name !== 'string') throw new Error(`Installed package does not match lock: ${location}`);
    const files = readdirSync(directory, { withFileTypes: true }).filter(file => file.isFile() && /^(?:licen[sc]e|copying|notice|ofl)(?:$|[._-])/i.test(file.name)).map(file => file.name).sort();
    const text = files.map(name => {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(resolve(directory, name))).replace(/\r\n/g, '\n').trim();
      if (content.length < 80 || content.includes('\0')) throw new Error(`Invalid license text for ${pkg.name}/${name}`);
      return { file: name, content, sha256: createHash('sha256').update(content).digest('hex') };
    });
    let supplement;
    if (!files.some(name => /^(?:licen[sc]e|copying|ofl)/i.test(name) && !/\.spdx$/i.test(name))) {
      const reviewed = supplements[`${pkg.name}@${pkg.version}`];
      if (!reviewed || pkg.license !== reviewed.declared) throw new Error(`Missing complete license text for ${pkg.name}@${pkg.version}; review this dependency before building`);
      const sibling = resolve(root, 'node_modules', reviewed.sibling);
      if (JSON.parse(readFileSync(resolve(sibling, 'package.json'), 'utf8')).version !== reviewed.version) throw new Error(`Unreviewed license supplement version for ${pkg.name}`);
      const licenseText = readFileSync(resolve(sibling, reviewed.license), 'utf8').replace(/\r\n/g, '\n').trim();
      const copyrightSource = reviewed.copyright === 'LICENSE.spdx' ? readFileSync(resolve(directory, reviewed.copyright), 'utf8') : readFileSync(resolve(sibling, reviewed.copyright), 'utf8').match(/^\/\*[\s\S]*?\*\//)?.[0];
      if (!copyrightSource || !/copyright/i.test(copyrightSource)) throw new Error(`Missing upstream copyright attribution for ${pkg.name}`);
      supplement = `Apache-2.0 option declared in ${pkg.name}@${pkg.version}/package.json; full text from ${reviewed.sibling}@${reviewed.version}/${reviewed.license}; attribution from ${reviewed.copyright}. No new font or dependency license is granted by Synaxis.`;
      for (const [file, content] of [['SUPPLEMENT-APACHE-2.0', licenseText], ['UPSTREAM-COPYRIGHT', copyrightSource.trim()]]) text.push({ file, content, sha256: createHash('sha256').update(content).digest('hex') });
    }
    const license = typeof pkg.license === 'string' ? pkg.license : 'See included license texts';
    records.push({ name: pkg.name, version: pkg.version, license, ...(supplement ? { supplement } : {}), files: text.map(({ file, sha256 }) => ({ file, sha256 })) });
    sections.push(`\n${'='.repeat(72)}\n${pkg.name}@${pkg.version}\nDeclared license: ${license}\n${supplement || ''}\n` + text.map(({ file, content }) => `\n--- ${file} ---\n${content}\n`).join(''));
  }
  if (!records.length) throw new Error('No production dependency notices found');
  const manifest = { scope: 'Locked production npm dependency closure, including dependencies that may be tree-shaken; installed optional packages only. Native Cargo dependencies are outside this npm inventory.', packages: records };
  return {
    'Third-Party-NPM.txt': 'Synaxis - third-party npm dependency notices\n\nCopyright and license texts from the exact locked production dependencies.\nSome dependencies may be removed from a particular bundle by tree shaking.\nNative Cargo packages retain separate licenses and are not represented by this npm inventory.\n' + sections.join(''),
    'Third-Party-NPM.json': JSON.stringify(manifest, null, 2) + '\n',
  };
}

export function prepareDependencyNotices(root, check = false) {
  const output = resolve(root, 'public/licenses');
  if (!check) mkdirSync(output, { recursive: true });
  const notices = dependencyNotices(root);
  for (const [name, content] of Object.entries(notices)) {
    const path = resolve(output, name);
    if (check) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== content) throw new Error(`Dependency notices are stale: ${name}; run npm run assets`);
    } else if (!existsSync(path) || readFileSync(path, 'utf8') !== content) writeFileSync(path, content);
  }
  return Object.keys(notices);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== '--check')) throw new Error('Usage: node scripts/prepare-notices.mjs [--check]');
  prepareDependencyNotices(resolve(import.meta.dirname, '..'), args[0] === '--check');
  console.log('PASS: complete production npm copyright/license notices match locked dependencies');
}
