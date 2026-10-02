import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// This builds locally only. It cannot authorize deployment or Redis effects.
const root = process.cwd();
const hash = value => createHash('sha256').update(value ?? '').digest('hex');
const git = args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function sourceFingerprint() {
  const names = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'lib', 'app', 'components', 'styles', 'public', 'scripts', 'examples', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'proxy.ts', 'proxy.js'])
    .split(/\r?\n/).filter(name => name && !/(^|\/)\.env(?:\.|$)/i.test(name));
  return hash(JSON.stringify([...new Set(names)].sort().map(name => [name, hash(readFileSync(resolve(root, name)))])));
}
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (existsSync(resolve(root, name))) throw new Error(`Refusing build with ${name} present`);
}
const env = {};
for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS']) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  BAZAAR_ENABLE_OPEN_WORKSPACES: 'false',
});
const startedAt = new Date().toISOString();
const candidateHead = git(['rev-parse', 'HEAD']);
const sourceBefore = sourceFingerprint();
const command = [resolve(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'];
const result = spawnSync(process.execPath, command, {
  cwd: root, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
});
const sourceAfter = sourceFingerprint();
const sourceStable = sourceBefore === sourceAfter;
const report = {
  scope: 'local production compilation only; no hosted acceptance or Redis verification',
  startedAt, finishedAt: new Date().toISOString(), runtime: process.version,
  executable: process.execPath, command, exitCode: result.status,
  candidateHead, sourceBefore, sourceAfter, sourceStable,
  sourceFingerprintScope: 'application, libraries, components, styles, public, scripts, examples, package files, tsconfig, next config and root proxy',
  signal: result.signal, errorCode: result.error?.code ?? null,
  cleanEnvironment: true, envFilesLoaded: false, workspacesEnabled: false,
  stdoutSha256: hash(result.stdout), stderrSha256: hash(result.stderr),
  buildId: result.status === 0 ? readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim() : null,
};
const directory = resolve(root, 'docs/evidence/sprint-public-pilot');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'local-build-latest.json'), JSON.stringify(report, null, 2) + '\n');
if (result.status === 0 && sourceStable) {
  function walk(path) {
    return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
      const file = resolve(path, entry.name);
      return entry.isDirectory() ? walk(file) : [{ path: file.slice(root.length + 1).replaceAll('\\', '/'), bytes: statSync(file).size, sha256: hash(readFileSync(file)) }];
    });
  }
  const assets = walk(resolve(root, '.next/static')).sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(resolve(directory, 'local-asset-inventory-latest.json'), JSON.stringify({
    buildId: report.buildId, sourceFingerprint: sourceAfter, candidateHead,
    buildReportSha256: hash(readFileSync(resolve(directory, 'local-build-latest.json'))),
    assetCount: assets.length, staticAssetsUncompressedBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), assets,
    limitations: ['All static assets is not the traffic of a browser journey', 'HTTP compression and hosted caching not measured', 'No deployment or Redis acceptance'],
  }, null, 2) + '\n');
}
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
console.log(JSON.stringify(report));
process.exitCode = result.status === 0 && sourceStable ? 0 : 1;
