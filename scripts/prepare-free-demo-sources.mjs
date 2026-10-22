// Local immutable source preparation only. No env/profile read or cloud client.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionSource } from './prepare-continuous-production-bazaar-source.mjs';
import { verifyProviderProductionSource } from './prepare-continuous-production-provider-source.mjs';
import { safeSourcePath, sourceDigest } from './prepare-functional-preview-source.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Error(code); };
export const FREE_DEMO_BASES = Object.freeze({
  bazaar: { sourceDirectory: '.vercel/hackathon-continuous-production-bazaar-source', manifest: 'docs/evidence/hackathon-continuous-production-bazaar-source-2026-10-11.json', manifestSha256: 'a0d8f979d027c2f946f62b4f78b00580bc434543dbf8fb6600e0904925980b04', sourceDigest: '49343e9a3c7c708deb5e73bf732def14d49df4ebce0ebd9cb2bae4a4d27879b7', files: 336 },
  provider: { sourceDirectory: '.vercel/hackathon-continuous-production-provider-source', manifest: 'docs/evidence/hackathon-continuous-production-provider-source-2026-10-11.json', manifestSha256: '5fb8a64bebac0cb88b10352ac304dbd55303dedfa01312e572a274c676da53b9', sourceDigest: 'cf9842a2508d994e6fb271e32d803ec479f56e2c61ef2fa070d3694be0d2fa11', files: 22 },
});
export const FREE_DEMO_OVERLAYS = Object.freeze({
  bazaar: Object.freeze(Object.fromEntries(['lib/demo-configuration.ts', 'lib/demo-http.ts', 'lib/marketplace.ts', 'lib/provider-self-listing.ts', 'lib/workspace-http.ts', 'lib/free-demo-window.ts', 'lib/free-demo-budget.ts', 'lib/mcp-onboarding-server.ts', 'lib/demo-instructions.ts'].map(path => [path, path]))),
  provider: Object.freeze({ 'seller/seller-hosted-tick.mjs': 'examples/seller-hosted-tick.mjs', 'seller/seller-hosted-handler.mjs': 'examples/seller-hosted-handler.mjs', 'server.ts': 'scripts/fixtures/free-demo-provider-server.ts.txt' }),
});
export function freeDemoTargets(kind, environment) {
  if (!['bazaar', 'provider'].includes(kind) || !['preview', 'production'].includes(environment)) fail('FREE_DEMO_TARGET_REQUIRED');
  return { sourceDirectory: `.vercel/hackathon-free-demo-${kind}-${environment}-source`, manifest: `docs/evidence/hackathon-free-demo-${kind}-${environment}-source-2026-10-11.json` };
}
function confined(root, path) {
  const target = resolve(root, path), rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) fail('FREE_DEMO_SOURCE_BOUNDARY');
  return target;
}
export async function readPlainFreeSource(root, path) {
  root = resolve(root); const target = confined(root, path), parts = relative(root, target).split(sep);
  if (parts.some(part => /^\.env/i.test(part) || /\.(?:dpapi|pem|key|pfx|p12|log)$/i.test(part) || ['private', '.aws', '.git', '.codex', '.agents'].includes(part))) fail('PRIVATE_FREE_DEMO_SOURCE_DENIED');
  let cursor = root;
  if ((await lstat(root)).isSymbolicLink()) fail('PLAIN_FREE_DEMO_SOURCE_REQUIRED');
  for (const part of parts) { cursor = resolve(cursor, part); if ((await lstat(cursor)).isSymbolicLink()) fail('PLAIN_FREE_DEMO_SOURCE_REQUIRED'); }
  if (!(await lstat(target)).isFile()) fail('PLAIN_FREE_DEMO_SOURCE_REQUIRED');
  return readFile(target);
}
function publicTarget(kind, path) {
  if (typeof path !== 'string' || path.includes('\\') || path.startsWith('/') || path.split('/').some(part => !part || ['.', '..', 'private', '.vercel', '.git', '.aws', '.codex', '.agents'].includes(part) || /^\.env/i.test(part)) || /\.(?:dpapi|pem|key|pfx|p12|log|tsbuildinfo)$/i.test(path)) return false;
  return kind === 'bazaar' ? safeSourcePath(path) : /^(?:seller\/[a-zA-Z0-9._-]+|src\/[a-zA-Z0-9._/-]+|[a-zA-Z0-9._-]+)$/.test(path);
}
export function freeDemoVercelConfiguration(kind, environment, original) {
  freeDemoTargets(kind, environment);
  const before = JSON.parse(Buffer.from(original).toString('utf8'));
  const expected = [{ path: kind === 'bazaar' ? '/api/market/guardian/tick' : '/api/bazaar/seller/tick', schedule: kind === 'bazaar' ? '*/15 * * * *' : '*/2 * * * *' }];
  if (JSON.stringify(before.crons) !== JSON.stringify(expected) || JSON.stringify(before.regions) !== JSON.stringify(['iad1']) || before.functions?.[kind === 'bazaar' ? 'app/api/**/route.ts' : 'server.ts']?.maxDuration !== 60) fail('EXACT_APPROVED_CRON_BASE_REQUIRED');
  const crons = environment === 'preview' ? [] : [{ path: expected[0].path, schedule: kind === 'bazaar' ? '0 * * * *' : '*/4 * * * *' }];
  return Buffer.from(JSON.stringify({ ...before, crons }, null, 2) + '\n');
}
export function validateFreeDemoCandidate(manifest, buffers, baseFiles, baseBuffers) {
  const { kind, environment } = manifest, targets = freeDemoTargets(kind, environment), allowed = new Set([...Object.keys(FREE_DEMO_OVERLAYS[kind]), 'vercel.json']);
  if (manifest.status !== 'FREE_DEMO_LOCAL_NOT_APPLIED' || manifest.sourceDirectory !== targets.sourceDirectory || manifest.manifest !== targets.manifest || manifest.previewAcceptancePending !== true || manifest.realPayments !== 0 || manifest.productionPublished !== false || manifest.cronActivated !== false || manifest.environmentApplied !== false || manifest.durationHours !== 24 || manifest.deadlineInstantiated !== false) fail('FREE_DEMO_MANIFEST_SCOPE_CHANGED');
  const expected = new Set([...baseFiles.map(file => file.path), ...Object.keys(FREE_DEMO_OVERLAYS[kind])]);
  const originals = new Map(baseFiles.map(file => [file.path, file]));
  if (!Array.isArray(manifest.files) || manifest.files.length !== expected.size || buffers.size !== expected.size) fail('FREE_DEMO_FILE_SET_CHANGED');
  const changes = [];
  for (const file of manifest.files) {
    if (!publicTarget(kind, file.path) || !expected.delete(file.path)) fail('FREE_DEMO_FILE_SET_CHANGED');
    const bytes = buffers.get(file.path), before = originals.get(file.path);
    if (!Buffer.isBuffer(bytes) || bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail('FREE_DEMO_SOURCE_BYTES_CHANGED');
    if (before && (sha(baseBuffers.get(file.path)) !== before.sha256 || baseBuffers.get(file.path).length !== before.bytes)) fail('FREE_DEMO_BASE_BYTES_CHANGED');
    if (!before || before.sha256 !== file.sha256 || before.bytes !== file.bytes) {
      if (!allowed.has(file.path)) fail('FREE_DEMO_OVERLAY_SCOPE_CHANGED');
      changes.push({ path: file.path, beforeSha256: before?.sha256 ?? null, afterSha256: file.sha256, added: !before, overlaySource: file.path === 'vercel.json' ? 'local-cron-configuration-only' : FREE_DEMO_OVERLAYS[kind][file.path] });
    }
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  if (expected.size || sourceDigest(manifest.files) !== manifest.sourceDigest || manifest.candidate !== `hackathon-free-demo-${kind}-${environment}-${manifest.sourceDigest.slice(0, 16)}` || JSON.stringify(changes) !== JSON.stringify(manifest.changes) || manifest.changedSourceFiles !== changes.length || manifest.identicalSourceFiles !== manifest.files.length - changes.length || manifest.addedSourceFiles !== changes.filter(change => change.added).length) fail('FREE_DEMO_MANIFEST_DIGEST_CHANGED');
  const config = freeDemoVercelConfiguration(kind, environment, baseBuffers.get('vercel.json'));
  if (!buffers.get('vercel.json').equals(config) || JSON.stringify(manifest.cronSchedules) !== JSON.stringify(JSON.parse(config).crons)) fail('FREE_DEMO_CRON_SCOPE_CHANGED');
  if (JSON.stringify(manifest.base) !== JSON.stringify(FREE_DEMO_BASES[kind])) fail('FREE_DEMO_BASE_BINDING_CHANGED');
  return true;
}
async function readApprovedBases(root) {
  const verifications = await Promise.all([verifyProductionSource(root), verifyProviderProductionSource(root)]);
  const bases = {};
  for (const [index, kind] of ['bazaar', 'provider'].entries()) {
    const binding = FREE_DEMO_BASES[kind], verification = verifications[index];
    if ((verification.effectiveSourceDigest ?? verification.sourceDigest) !== binding.sourceDigest || verification.manifestSha256 !== binding.manifestSha256 || verification.files !== binding.files) fail('EXACT_APPROVED_FREE_DEMO_BASE_REQUIRED');
    const raw = await readPlainFreeSource(root, binding.manifest);
    if (sha(raw) !== binding.manifestSha256) fail('EXACT_APPROVED_FREE_DEMO_BASE_REQUIRED');
    const base = JSON.parse(raw), buffers = new Map();
    for (const file of base.files) {
      if (!publicTarget(kind, file.path) || buffers.has(file.path)) fail('FREE_DEMO_BASE_FILE_SET_CHANGED');
      const bytes = await readPlainFreeSource(root, `${binding.sourceDirectory}/${file.path}`);
      if (sha(bytes) !== file.sha256 || bytes.length !== file.bytes) fail('FREE_DEMO_BASE_BYTES_CHANGED');
      buffers.set(file.path, bytes);
    }
    bases[kind] = { files: base.files, buffers };
  }
  return bases;
}
function sourcePreparationPlan(candidates) { return { version: 1, status: 'FREE_DEMO_LOCAL_SOURCE_PLAN', durationHours: 24, deadlineInstantiated: false, candidates, approvedSourcesModified: false, previewAcceptancePending: true, realPayments: 0, networkRequests: 0, cloudWrites: 0 }; }
export async function inspectFreeDemoSources(root = process.cwd()) {
  root = resolve(root); const bases = await readApprovedBases(root), candidates = [], bufferSets = new Map();
  for (const kind of ['bazaar', 'provider']) {
    const overlays = new Map();
    for (const [target, source] of Object.entries(FREE_DEMO_OVERLAYS[kind])) overlays.set(target, await readPlainFreeSource(root, source));
    for (const environment of ['preview', 'production']) {
      const targets = freeDemoTargets(kind, environment), buffers = new Map(bases[kind].buffers);
      for (const [path, bytes] of overlays) buffers.set(path, bytes);
      buffers.set('vercel.json', freeDemoVercelConfiguration(kind, environment, bases[kind].buffers.get('vercel.json')));
      const files = [...buffers].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })).sort((a, b) => a.path.localeCompare(b.path)), digest = sourceDigest(files);
      const original = new Map(bases[kind].files.map(file => [file.path, file]));
      const changes = files.filter(file => !original.has(file.path) || original.get(file.path).sha256 !== file.sha256 || original.get(file.path).bytes !== file.bytes).map(file => ({ path: file.path, beforeSha256: original.get(file.path)?.sha256 ?? null, afterSha256: file.sha256, added: !original.has(file.path), overlaySource: file.path === 'vercel.json' ? 'local-cron-configuration-only' : FREE_DEMO_OVERLAYS[kind][file.path] }));
      const manifest = { version: 1, status: 'FREE_DEMO_LOCAL_NOT_APPLIED', kind, environment, ...targets, candidate: `hackathon-free-demo-${kind}-${environment}-${digest.slice(0, 16)}`, sourceDigest: digest, base: FREE_DEMO_BASES[kind], files, changes, identicalSourceFiles: files.length - changes.length, changedSourceFiles: changes.length, addedSourceFiles: changes.filter(change => change.added).length, cronSchedules: JSON.parse(buffers.get('vercel.json')).crons, durationHours: 24, deadlineInstantiated: false, previewAcceptancePending: true, realPayments: 0, privateFilesIncluded: 0, credentialsCopied: false, productionPublished: false, cronActivated: false, environmentApplied: false, networkRequests: 0 };
      validateFreeDemoCandidate(manifest, buffers, bases[kind].files, bases[kind].buffers);
      candidates.push(manifest); bufferSets.set(kind + ':' + environment, buffers);
    }
  }
  const plan = sourcePreparationPlan(candidates);
  const planDigest = sha(Buffer.from(JSON.stringify(plan)));
  return { plan: { ...plan, planDigest }, bufferSets, bases };
}
async function absent(root, path) { try { await lstat(confined(root, path)); fail('NEW_FREE_DEMO_OUTPUT_REQUIRED'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
export async function prepareFreeDemoSources(root, expectedPlanDigest) {
  root = resolve(root); const inspected = await inspectFreeDemoSources(root);
  if (!/^[a-f0-9]{64}$/.test(expectedPlanDigest ?? '') || expectedPlanDigest !== inspected.plan.planDigest) fail('EXACT_FREE_DEMO_PLAN_REQUIRED');
  for (const manifest of inspected.plan.candidates) { await absent(root, manifest.sourceDirectory); await absent(root, manifest.manifest); }
  // All four targets are checked before any output. Existing artifacts are
  // never replaced or cleaned up automatically after an uncertain local write.
  for (const path of ['.vercel', 'docs', 'docs/evidence']) if (!(await lstat(confined(root, path))).isDirectory() || (await lstat(confined(root, path))).isSymbolicLink()) fail('PLAIN_FREE_DEMO_PARENT_REQUIRED');
  const outputs = [];
  for (const manifest of inspected.plan.candidates) {
    const output = confined(root, manifest.sourceDirectory), buffers = inspected.bufferSets.get(manifest.kind + ':' + manifest.environment);
    await mkdir(output);
    for (const file of manifest.files) { const destination = confined(output, file.path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, buffers.get(file.path), { flag: 'wx' }); }
    const bytes = Buffer.from(JSON.stringify({ ...manifest, preparationPlanDigest: inspected.plan.planDigest, preparedAt: new Date().toISOString() }, null, 2) + '\n');
    await writeFile(confined(root, manifest.manifest), bytes, { flag: 'wx', mode: 0o600 });
    outputs.push({ kind: manifest.kind, environment: manifest.environment, sourceDirectory: manifest.sourceDirectory, sourceDigest: manifest.sourceDigest, manifest: manifest.manifest, manifestSha256: sha(bytes), files: manifest.files.length, changedSourceFiles: manifest.changedSourceFiles, addedSourceFiles: manifest.addedSourceFiles, cronSchedules: manifest.cronSchedules });
  }
  return { status: 'FREE_DEMO_LOCAL_NOT_APPLIED', planDigest: inspected.plan.planDigest, outputs, approvedSourcesModified: false, previewAcceptancePending: true, realPayments: 0, networkRequests: 0, deployments: 0, cronActivated: false };
}
async function inventory(directory, prefix = '') {
  const paths = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) fail('PLAIN_FREE_DEMO_SOURCE_REQUIRED');
    if (entry.isDirectory()) paths.push(...await inventory(directory, path)); else if (entry.isFile()) paths.push(path); else fail('PLAIN_FREE_DEMO_SOURCE_REQUIRED');
  }
  return paths;
}
export async function verifyFreeDemoSources(root = process.cwd()) {
  root = resolve(root); const bases = await readApprovedBases(root), outputs = [], candidates = [];
  for (const kind of ['bazaar', 'provider']) for (const environment of ['preview', 'production']) {
    const targets = freeDemoTargets(kind, environment), bytes = await readPlainFreeSource(root, targets.manifest), manifest = JSON.parse(bytes), buffers = new Map();
    const paths = await inventory(confined(root, targets.sourceDirectory));
    if (paths.length !== manifest.files.length || paths.some(path => !manifest.files.some(file => file.path === path))) fail('UNMANIFESTED_FREE_DEMO_SOURCE');
    for (const file of manifest.files) buffers.set(file.path, await readPlainFreeSource(root, `${targets.sourceDirectory}/${file.path}`));
    validateFreeDemoCandidate(manifest, buffers, bases[kind].files, bases[kind].buffers);
    if (!/^[a-f0-9]{64}$/.test(manifest.preparationPlanDigest ?? '') || !Number.isFinite(Date.parse(manifest.preparedAt ?? ''))) fail('FREE_DEMO_PREPARATION_PROOF_REQUIRED');
    const { preparationPlanDigest, preparedAt, ...candidate } = manifest; candidates.push(candidate);
    outputs.push({ kind, environment, sourceDirectory: targets.sourceDirectory, sourceDigest: manifest.sourceDigest, manifest: targets.manifest, manifestSha256: sha(bytes), preparationPlanDigest: manifest.preparationPlanDigest, files: manifest.files.length, changedSourceFiles: manifest.changedSourceFiles, addedSourceFiles: manifest.addedSourceFiles, cronSchedules: manifest.cronSchedules });
  }
  if (new Set(outputs.map(output => output.preparationPlanDigest)).size !== 1) fail('ONE_FREE_DEMO_PREPARATION_PLAN_REQUIRED');
  if (sha(Buffer.from(JSON.stringify(sourcePreparationPlan(candidates)))) !== outputs[0].preparationPlanDigest) fail('FREE_DEMO_PREPARATION_PLAN_CHANGED');
  return { status: 'FREE_DEMO_LOCAL_SOURCES_VERIFIED', outputs, approvedSourcesModified: false, previewAcceptancePending: true, realPayments: 0, networkRequests: 0, deployments: 0, cronActivated: false };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const action = process.argv[2];
    if (!['inspect', 'prepare', 'verify'].includes(action) || process.argv.length !== (action === 'prepare' ? 4 : 3)) fail('OFFLINE_FREE_DEMO_SOURCE_ACTION_REQUIRED');
    const result = action === 'inspect' ? (await inspectFreeDemoSources()).plan : action === 'prepare' ? await prepareFreeDemoSources(process.cwd(), process.argv[3]) : await verifyFreeDemoSources();
    console.log(JSON.stringify(action === 'inspect' ? { ...result, candidates: result.candidates.map(candidate => ({ ...candidate, files: candidate.files.length })) } : result));
  } catch (error) { console.error(JSON.stringify({ status: 'UNCONFIRMED', code: /^[A-Z][A-Z0-9_]{1,95}$/.test(error?.message ?? '') ? error.message : 'FREE_DEMO_SOURCE_UNCONFIRMED', cloudWrites: 0, deployments: 0 })); process.exitCode = 1; }
}
