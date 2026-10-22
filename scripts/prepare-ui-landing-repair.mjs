import { readFile, writeFile, mkdir, lstat, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { safeSourcePath, sourceDigest } from './prepare-functional-preview-source.mjs';

const root = resolve(import.meta.dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const source = '.vercel/ui-landing-repair-source';
const variant = process.argv[2] === '--rebuild-v3' ? 'v3' : 'v2';
const retry = process.argv.length === 3 && ['--rebuild-v2', '--rebuild-v3'].includes(process.argv[2]);
const build = retry ? '.vercel/ui-landing-repair-local-build-' + variant : '.vercel/ui-landing-repair-local-build';
const parentPath = 'docs/evidence/payment-recovery-acceptance-bazaar-source-v2-2026-10-12.json';
const overlays = ['app/page.tsx', 'lib/pilot-route-policy.ts'];
const resume = process.argv.length === 3 && process.argv[2] === '--resume-local-build';
if (!resume && !retry && process.argv.length !== 2) throw Error('LOCAL_UI_BUILD_ACTION_REQUIRED');
const parentBytes = await readFile(resolve(root, parentPath));
if (sha(parentBytes) !== '2252de2a1849488ca5998e54f4f77d467327b7547ff1c9296e78147780e1c42c') throw Error('CURRENT_PRODUCTION_MANIFEST_REQUIRED');
const parent = JSON.parse(parentBytes);
if (parent.sourceDigest !== '3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed' || parent.files.length !== 344 || sourceDigest(parent.files) !== parent.sourceDigest) throw Error('CURRENT_PRODUCTION_SOURCE_REQUIRED');
if (!resume) {
  if (!retry) await mkdir(resolve(root, source));
  await mkdir(resolve(root, build));
}
const files = [];
for (const row of parent.files) {
  if (!safeSourcePath(row.path)) throw Error('PUBLIC_SOURCE_PATH_REQUIRED');
  const original = resolve(root, parent.sourceDirectory, row.path);
  if (!(await lstat(original)).isFile()) throw Error('PLAIN_SOURCE_FILE_REQUIRED');
  const before = await readFile(original);
  if (before.length !== row.bytes || sha(before) !== row.sha256) throw Error('CURRENT_PRODUCTION_SOURCE_CHANGED');
  const bytes = overlays.includes(row.path) ? await readFile(resolve(root, row.path)) : before;
  files.push({ path: row.path, bytes: bytes.length, sha256: sha(bytes) });
  for (const directory of [source, build]) {
    const target = resolve(root, directory, row.path);
    if (resume || retry && directory === source) {
      if (!bytes.equals(await readFile(target))) throw Error('PARTIAL_UI_BUILD_SOURCE_CHANGED');
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
    }
  }
}
const changed = files.filter(row => row.sha256 !== parent.files.find(v => v.path === row.path).sha256).map(v => v.path).sort();
if (changed.join(',') !== overlays.sort().join(',')) throw Error('ONLY_TWO_UI_REPAIR_OVERLAYS_REQUIRED');
const sourceRecord = { version: 1, status: 'FROZEN_UI_LANDING_REPAIR_NOT_PUBLISHED', sourceDirectory: source, sourceDigest: sourceDigest(files), parentSourceDigest: parent.sourceDigest, parentManifest: parentPath, parentManifestSha256: sha(parentBytes), fileCount: files.length, changedPaths: changed, files, crons: JSON.parse(await readFile(resolve(root, source, 'vercel.json'))).crons, backendChanged: false, paymentChanged: false, limitChanged: false, credentialsIncluded: false, productionPublished: false };
const sourceEvidence = 'docs/evidence/ui-landing-repair-source-2026-10-13.json';
const sourceRecordBytes = Buffer.from(JSON.stringify(sourceRecord, null, 2) + '\n');
if (resume || retry) {
  if (!sourceRecordBytes.equals(await readFile(resolve(root, sourceEvidence)))) throw Error('FROZEN_UI_MANIFEST_CHANGED');
} else await writeFile(resolve(root, sourceEvidence), sourceRecordBytes, { flag: 'wx' });
await symlink(resolve(root, 'node_modules'), resolve(root, build, 'node_modules'), 'junction');
const preload = resolve(root, retry ? '.vercel/ui-landing-repair-build-' + variant + '-offline.cjs' : '.vercel/ui-landing-repair-build-offline.cjs');
await writeFile(preload, "const deny=()=>{throw Error('UI_BUILD_NETWORK_DENIED');};for(const name of ['node:http','node:https']){const m=require(name);m.request=deny;m.get=deny;}globalThis.fetch=deny;\n", { flag: 'wx' });
const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'PATHEXT'];
const env = { ...Object.fromEntries(allowed.filter(k => process.env[k]).map(k => [k, process.env[k]])),
  NODE_ENV: 'production', NODE_OPTIONS: '--require "' + preload.replaceAll('\\', '/') + '"', NEXT_TELEMETRY_DISABLED: '1',
  BAZAAR_ENABLE_MARKETPLACE: variant === 'v3' && retry ? 'false' : 'true', NEXT_PUBLIC_BAZAAR_MARKETPLACE: 'true', BAZAAR_PUBLIC_DEMO: 'true', BAZAAR_ROUTE_BOUNDARY: 'true',
  BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:pilot-00000000000000000000000000000000',
  BAZAAR_MARKET_PREFIX: 'bazaar-market:pilot-00000000000000000000000000000000',
  BAZAAR_REVIEW_PREFIX: 'bazaar-review:pilot-00000000000000000000000000000000',
  BAZAAR_DYNAMIC_PREFIX: 'bazaar-market:pilot-00000000000000000000000000000000:catalog', BAZAAR_WORKSPACE_BACKEND: 'redis',
  BAZAAR_ENABLE_MARKET_PURCHASES: 'false', BAZAAR_MARKET_FILES_ENABLED: 'false', BAZAAR_WORKSPACE_CREATION_PAUSED: 'true', BAZAAR_ENABLE_OPEN_WORKSPACES: 'false' };
console.log(JSON.stringify({ stage: 'source-frozen-local-build-started', sourceDigest: sourceRecord.sourceDigest, fileCount: files.length, changedPaths: changed, privateEnvironmentInherited: false }));
const startedAt = new Date().toISOString();
const result = await new Promise(done => {
  const child = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], { cwd: resolve(root, build), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', complete = false;
  const finish = value => { if (complete) return; complete = true; clearTimeout(timer); done(value); };
  const timer = setTimeout(() => { child.kill(); finish({ exitCode: null, output: 'UI_BUILD_TIMEOUT' }); }, 240000);
  const collect = bytes => { output += bytes.toString(); if (output.length > 2097152) { child.kill(); finish({ exitCode: null, output: 'UI_BUILD_OUTPUT_BOUND' }); } };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  child.on('close', exitCode => finish({ exitCode, output: output.slice(-18000) }));
  child.on('error', () => finish({ exitCode: null, output: 'UI_BUILD_UNAVAILABLE' }));
});
for (const row of files) if (sha(await readFile(resolve(root, source, row.path))) !== row.sha256) throw Error('FROZEN_UI_SOURCE_CHANGED');
const evidence = retry ? 'docs/evidence/ui-landing-repair-build-' + variant + '-2026-10-13.json' : 'docs/evidence/ui-landing-repair-build-2026-10-13.json';
const record = { version: 1, status: result.exitCode === 0 ? 'PASS_UI_LANDING_REPAIR_BUILD' : 'FAIL_UI_LANDING_REPAIR_BUILD', sourceDigest: sourceRecord.sourceDigest, sourceEvidence, startedAt, completedAt: new Date().toISOString(), ...result, offlineNetworkBlocked: true, privateEnvironmentInherited: false, realRedisConfigured: false, compilationMarketEnabled: env.BAZAAR_ENABLE_MARKETPLACE, runtimeMarketMustBeEnabledForVisualAcceptance: true, productionPublished: false, limitsChanged: false, payments: 0 };
await writeFile(resolve(root, evidence), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: record.status, sourceDigest: record.sourceDigest, evidence, ...(result.exitCode !== 0 ? { diagnostic: result.output.slice(-4500) } : {}) }));
if (result.exitCode !== 0) process.exitCode = 1;
