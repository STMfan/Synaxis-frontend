import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, readdirSync, realpathSync, copyFileSync, statSync, lstatSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const root = join(frontend, 'src-tauri/gen/android');
const targets = { aarch64: { triple: 'aarch64-linux-android', abi: 'arm64-v8a', flavor: 'Arm64' }, x86_64: { triple: 'x86_64-linux-android', abi: 'x86_64', flavor: 'X86_64' } };
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run build:android -- [aarch64|x86_64] [--debug|--release]\nRelease is the default and requires private signing. Debug uses the Android development keystore.\nToolchain: JAVA_HOME (or java on PATH), ANDROID_HOME (or adb on PATH), NDK_HOME (or SDK/ndk).');
  process.exit(0);
}
const target = args.find(arg => !arg.startsWith('--')) || 'aarch64';
if (!targets[target] || args.some(arg => ![target, '--debug', '--release'].includes(arg)) || (args.includes('--debug') && args.includes('--release'))) {
  throw new Error('Supported arguments: [aarch64|x86_64] [--debug|--release]');
}
const profile = args.includes('--debug') ? 'debug' : 'release';
if (profile === 'release' && !existsSync(join(root, 'keystore.properties'))) {
  throw new Error('Release signing requires private keystore.properties. For a build without private keys, use npm run build:android -- --debug. See docs/android.md.');
}

function onPath(name) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const suffix of suffixes) {
      const candidate = join(directory.replace(/^"|"$/g, ''), name + suffix);
      if (existsSync(candidate) && statSync(candidate).isFile()) return realpathSync(candidate);
    }
  }
}
function latestInstalled(directory) {
  if (!existsSync(directory)) return undefined;
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
}
const javaOnPath = onPath('java');
const javaHome = process.env.JAVA_HOME || (javaOnPath && dirname(dirname(javaOnPath)));
const java = javaHome && join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
if (!java || !existsSync(java) || !existsSync(join(javaHome, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'))) {
  throw new Error('Install JDK 21 or newer and set JAVA_HOME (or put the JDK java/javac on PATH).');
}
const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8' });
const javaMajor = Number(((javaVersion.stderr || '') + (javaVersion.stdout || '')).match(/version\s+"?(\d+)/)?.[1]);
if (javaVersion.status !== 0 || !Number.isFinite(javaMajor) || javaMajor < 21) throw new Error('Android builds require JDK 21 or newer. Check JAVA_HOME.');
const adb = onPath('adb');
const standardSdks = process.platform === 'win32'
  ? [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android/Sdk')]
  : [join(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk')];
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (adb && dirname(dirname(adb))) || standardSdks.find(directory => directory && existsSync(directory));
if (!sdk || !existsSync(join(sdk, 'platform-tools'))) throw new Error('Install Android SDK platform-tools and set ANDROID_HOME (or put adb on PATH).');
const ndkVersion = latestInstalled(join(sdk, 'ndk'));
const ndk = process.env.NDK_HOME || process.env.ANDROID_NDK_HOME || (ndkVersion && join(sdk, 'ndk', ndkVersion));
if (!ndk || !existsSync(join(ndk, 'source.properties'))) throw new Error('Install an Android NDK in SDK/ndk or set NDK_HOME.');
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, NDK_HOME: ndk, GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || join(frontend, '.cache/gradle'), PATH: join(javaHome, 'bin') + delimiter + (process.env.PATH || '') };
const results = join(frontend, 'test-results');
mkdirSync(results, { recursive: true });
// Source ZIPs created on Windows may lose the wrapper's executable bit.
if (process.platform !== 'win32') chmodSync(join(root, 'gradlew'), 0o755);
const cliArgs = [join(frontend, 'node_modules/@tauri-apps/cli/tauri.js'), 'android', 'build', '--apk', '--split-per-abi', '--target', target, '--ci'];
if (profile === 'debug') cliArgs.push('--debug');
const result = spawnSync(process.execPath, cliArgs, { cwd: frontend, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const log = (result.stdout || '') + (result.stderr || '');
writeFileSync(join(results, `android-${target}-${profile}-build.log`), log);
if (result.error) throw result.error;
if (result.status !== 0) {
  const plainLog = log.replace(/\x1b\[[0-9;]*m/g, '');
  // Cargo must have completed this profile in this invocation. A cached
  // successful build is valid; a library merely left on disk is not.
  const cargoFinished = new RegExp('Finished [`"]' + (profile === 'release' ? 'release' : 'dev') + '[`"] profile').test(plainLog);
  const info = targets[target];
  const source = join(frontend, 'src-tauri/target', info.triple, profile, 'libsynaxis_client_lib.so');
  if (process.platform !== 'win32' || !/Creation symbolic link is not allowed/.test(plainLog) || !cargoFinished || !plainLog.includes('libsynaxis_client_lib.so') || /could not compile|error\[E\d+\]/.test(plainLog) || !existsSync(source)) {
    process.stderr.write(log);
    process.exit(result.status || 1);
  }
  const dest = join(root, 'app/src/main/jniLibs', info.abi);
  mkdirSync(dest, { recursive: true });
  const library = join(dest, 'libsynaxis_client_lib.so');
  // Never copy through a previously generated symlink into its old target.
  if (lstatSync(library, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(library);
  copyFileSync(source, library);
  console.log('Windows symlink permission unavailable: assembling the library from this successful Cargo invocation.');
  const variant = profile[0].toUpperCase() + profile.slice(1);
  // Java avoids shell quoting for .bat wrappers when paths contain spaces.
  const gradle = spawnSync(java, ['-classpath', join(root, 'gradle/wrapper/gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain', `assemble${info.flavor}${variant}`, '-x', `:app:rustBuild${info.flavor}${variant}`, '--console=plain', '--no-daemon'], { cwd: root, env, stdio: 'inherit' });
  if (gradle.error) throw gradle.error;
  if (gradle.status !== 0) process.exit(gradle.status || 1);
} else process.stdout.write(log);
const apkDir = join(root, 'app/build/outputs/apk', targets[target].flavor.toLowerCase(), profile);
const apks = readdirSync(apkDir).filter(file => file.endsWith('.apk') && !file.includes('unsigned'));
if (apks.length !== 1) throw new Error(`Expected one signed ${profile} APK; found ${apks.length}. Inspect ${apkDir}.`);
const source = join(apkDir, apks[0]);
const bytes = statSync(source).size;
if (bytes >= 100_000_000) throw new Error(`APK exceeds 100 MB budget: ${bytes} bytes`);
const buildTools = latestInstalled(join(sdk, 'build-tools'));
const signer = buildTools && join(sdk, 'build-tools', buildTools, 'lib/apksigner.jar');
if (!signer || !existsSync(signer)) throw new Error('Install Android SDK build-tools with apksigner.');
const verified = spawnSync(java, ['-jar', signer, 'verify', '--verbose', source], { env, encoding: 'utf8' });
if (verified.error) throw verified.error;
if (verified.status !== 0) { process.stderr.write(verified.stderr || verified.stdout); throw new Error('APK signature verification failed'); }
const version = JSON.parse(readFileSync(join(frontend, 'package.json'), 'utf8')).version;
const aapt = join(sdk, 'build-tools', buildTools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
const manifest = spawnSync(aapt, ['dump', 'badging', source], { env, encoding: 'utf8' });
if (manifest.error) throw manifest.error;
if (manifest.status !== 0) throw new Error('Cannot verify APK version with Android SDK aapt2.');
const versionName = manifest.stdout.match(/\bversionName='([^']+)'/)?.[1];
const versionCode = Number(manifest.stdout.match(/\bversionCode='(\d+)'/)?.[1]);
const expectedVersionCode = Number(readFileSync(join(root, 'app/release.properties'), 'utf8').match(/^\s*versionCode\s*=\s*(\d+)\s*$/m)?.[1]);
if (versionName !== version || versionCode !== expectedVersionCode) throw new Error('APK version does not match package.json and Android release.properties.');
const output = join(frontend, `releases/android/Synaxis_${version}_${targets[target].abi}${profile === 'debug' ? '_debug' : ''}.apk`);
mkdirSync(dirname(output), { recursive: true });
copyFileSync(source, output);
const sha256 = createHash('sha256').update(readFileSync(output)).digest('hex');
writeFileSync(output + '.sha256', sha256 + '  ' + output.split(/[\\/]/).at(-1) + '\n');
writeFileSync(join(results, `android-${target}-${profile}.json`), JSON.stringify({ version, versionCode, target, profile, output, bytes, sha256, signature: verified.stdout }, null, 2));
console.log(`Signed ${profile} APK: ${output} (${(bytes / 1e6).toFixed(2)} MB), signature verified.`);
