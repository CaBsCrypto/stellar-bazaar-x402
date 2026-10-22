import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { freeDemoTargets, FREE_DEMO_OVERLAYS, inspectFreeDemoSources, prepareFreeDemoSources, validateFreeDemoCandidate, freeDemoVercelConfiguration, readPlainFreeSource } from './prepare-free-demo-sources.mjs';

let checks = 0, networkRequests = 0, skippedSymlinkChecks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const rejects = async (f, pattern) => { await assert.rejects(f, pattern); checks++; };
const fails = (f, pattern) => { assert.throws(f, pattern); checks++; };
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { networkRequests++; throw Error('OFFLINE_SOURCE_TEST_ONLY'); };
const root = resolve(process.cwd()), fixture = await mkdtemp(resolve(root, '.vercel/free-source-fixture-'));
try {
  eq(Object.keys(FREE_DEMO_OVERLAYS.bazaar).length, 9);
  eq(Object.keys(FREE_DEMO_OVERLAYS.provider).length, 3);
  fails(() => freeDemoTargets('other', 'production'), /FREE_DEMO_TARGET_REQUIRED/);
  fails(() => freeDemoTargets('bazaar', 'wrong'), /FREE_DEMO_TARGET_REQUIRED/);
  const inspected = await inspectFreeDemoSources(root);
  eq(inspected.plan.candidates.length, 4);
  eq(inspected.plan.approvedSourcesModified, false);
  await rejects(() => prepareFreeDemoSources(root, '0'.repeat(64)), /EXACT_FREE_DEMO_PLAN_REQUIRED/);
  for (const manifest of inspected.plan.candidates) {
    const base = inspected.bases[manifest.kind], buffers = inspected.bufferSets.get(manifest.kind + ':' + manifest.environment);
    eq(validateFreeDemoCandidate(manifest, buffers, base.files, base.buffers), true);
    eq(manifest.realPayments, 0); eq(manifest.previewAcceptancePending, true); eq(manifest.deadlineInstantiated, false);
    eq(manifest.files.length, manifest.kind === 'bazaar' ? 338 : 22);
    const config = JSON.parse(buffers.get('vercel.json'));
    eq(config.crons, manifest.environment === 'preview' ? [] : [{ path: manifest.kind === 'bazaar' ? '/api/market/guardian/tick' : '/api/bazaar/seller/tick', schedule: manifest.kind === 'bazaar' ? '0 * * * *' : '*/4 * * * *' }]);
    eq({ ...config, crons: JSON.parse(base.buffers.get('vercel.json')).crons }, JSON.parse(base.buffers.get('vercel.json')));
    const changed = new Map(buffers), ordinary = base.files.find(file => file.path !== 'vercel.json' && !Object.hasOwn(FREE_DEMO_OVERLAYS[manifest.kind], file.path));
    changed.set(ordinary.path, Buffer.from('unapproved change'));
    fails(() => validateFreeDemoCandidate(manifest, changed, base.files, base.buffers), /FREE_DEMO_SOURCE_BYTES_CHANGED/);
    for (const patch of [{ realPayments: 1 }, { previewAcceptancePending: false }, { deadlineInstantiated: true }, { sourceDigest: 'f'.repeat(64) }, { changes: [] }, { base: { ...manifest.base, sourceDigest: 'f'.repeat(64) } }]) fails(() => validateFreeDemoCandidate({ ...manifest, ...patch }, buffers, base.files, base.buffers), /FREE_DEMO_/);
    const unmanifested = new Map(buffers); unmanifested.set('.env', Buffer.from('must never read'));
    fails(() => validateFreeDemoCandidate(manifest, unmanifested, base.files, base.buffers), /FREE_DEMO_FILE_SET_CHANGED/);
    const missing = new Map(buffers); missing.delete(ordinary.path);
    fails(() => validateFreeDemoCandidate(manifest, missing, base.files, base.buffers), /FREE_DEMO_FILE_SET_CHANGED/);
    fails(() => freeDemoVercelConfiguration(manifest.kind, manifest.environment, Buffer.from(JSON.stringify({ ...JSON.parse(base.buffers.get('vercel.json')), crons: [] }))), /EXACT_APPROVED_CRON_BASE_REQUIRED/);
  }
  await mkdir(resolve(fixture, 'public'));
  await writeFile(resolve(fixture, 'public/code.ts'), 'public source');
  eq((await readPlainFreeSource(fixture, 'public/code.ts')).toString(), 'public source');
  await rejects(() => readPlainFreeSource(fixture, '../outside'), /FREE_DEMO_SOURCE_BOUNDARY/);
  await rejects(() => readPlainFreeSource(fixture, '.vercel/key.dpapi'), /PRIVATE_FREE_DEMO_SOURCE_DENIED/);
  await rejects(() => readPlainFreeSource(fixture, '.env.local'), /PRIVATE_FREE_DEMO_SOURCE_DENIED/);
  await rejects(() => readPlainFreeSource(fixture, 'public'), /PLAIN_FREE_DEMO_SOURCE_REQUIRED/);
  try {
    await symlink(resolve(fixture, 'public'), resolve(fixture, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await rejects(() => readPlainFreeSource(fixture, 'linked/code.ts'), /PLAIN_FREE_DEMO_SOURCE_REQUIRED/);
  } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) skippedSymlinkChecks++; else throw error; }
  eq(networkRequests, 0);
  console.log(JSON.stringify({ status: 'PASS', checks, skippedSymlinkChecks, planDigest: inspected.plan.planDigest, candidates: inspected.plan.candidates.map(candidate => ({ kind: candidate.kind, environment: candidate.environment, files: candidate.files.length, sourceDigest: candidate.sourceDigest, changedSourceFiles: candidate.changedSourceFiles, addedSourceFiles: candidate.addedSourceFiles })), approvedSourcesModified: false, snapshotsPrepared: false, cloudWrites: 0, networkRequests, privateProfileReads: 0, realPayments: 0 }));
} finally {
  globalThis.fetch = oldFetch;
  // The sole disposable target was allocated by this test under this workspace.
  const rel = relative(root, fixture);
  if (!rel.startsWith('.vercel' + sep + 'free-source-fixture-') || rel.includes('..') || isAbsolute(rel)) throw Error('OWN_TEST_FIXTURE_CLEANUP_ONLY');
  await rm(fixture, { recursive: true, force: false });
}
