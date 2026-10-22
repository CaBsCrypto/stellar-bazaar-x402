// Local immutable source preparation only. No env/profile read or cloud client.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, dirname, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionSource } from './prepare-continuous-production-bazaar-source.mjs';
import { verifyProviderProductionSource } from './prepare-continuous-production-provider-source.mjs';
import { safeSourcePath, sourceDigest } from './prepare-functional-preview-source.mjs';
import {verifyOnDemandSources as verifyRevisionOneSources} from './prepare-on-demand-sources.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Error(code); };
export const ON_DEMAND_BASES = Object.freeze({
  bazaar: { sourceDirectory: '.vercel/hackathon-continuous-production-bazaar-source', manifest: 'docs/evidence/hackathon-continuous-production-bazaar-source-2026-10-11.json', manifestSha256: 'a0d8f979d027c2f946f62b4f78b00580bc434543dbf8fb6600e0904925980b04', sourceDigest: '49343e9a3c7c708deb5e73bf732def14d49df4ebce0ebd9cb2bae4a4d27879b7', files: 336 },
  provider: { sourceDirectory: '.vercel/hackathon-continuous-production-provider-source', manifest: 'docs/evidence/hackathon-continuous-production-provider-source-2026-10-11.json', manifestSha256: '5fb8a64bebac0cb88b10352ac304dbd55303dedfa01312e572a274c676da53b9', sourceDigest: 'cf9842a2508d994e6fb271e32d803ec479f56e2c61ef2fa070d3694be0d2fa11', files: 22 },
});
export const ON_DEMAND_OVERLAYS = Object.freeze({
  bazaar: Object.freeze(Object.fromEntries(['lib/demo-configuration.ts', 'lib/demo-http.ts', 'lib/marketplace.ts', 'lib/provider-self-listing.ts', 'lib/workspace-http.ts', 'lib/free-demo-window.ts', 'lib/free-demo-budget.ts', 'lib/continuous-free-budget.ts', 'lib/continuous-free-storage.ts', 'lib/market-text-seller-runtime.ts', 'lib/market-text-seller-after.ts', 'lib/workspace-store.ts', 'lib/provider-review-redis.ts', 'lib/marketplace-store.ts', 'lib/marketplace-x402.ts', 'lib/marketplace-http.ts', 'lib/marketplace-mcp.ts', 'lib/marketplace-capacity.ts', 'lib/market-guardian.ts', 'lib/market-maintenance.ts', 'lib/mcp-onboarding-server.ts', 'lib/demo-instructions.ts', 'components/MarketCatalog.tsx', 'components/ServicePurchaseEntry.tsx', 'app/resources/[id]/page.tsx', 'public/AGENT_CONNECTION.md', 'public/DEMO_TESTNET.md', 'public/SELLER_AGENT_KIT.md', 'public/PROVIDER_ONBOARDING.md'].map(path => [path, path]))),
  provider: Object.freeze({ 'seller/seller-hosted-tick.mjs': 'examples/seller-hosted-tick.mjs', 'seller/seller-hosted-handler.mjs': 'examples/seller-hosted-handler.mjs', 'seller/seller-redis-secret-store.mjs':'examples/seller-redis-secret-store.mjs', 'server.ts': 'scripts/fixtures/on-demand-provider-server.ts.txt' }),
});
export function onDemandTargets(kind, environment) {
  if (!['bazaar', 'provider'].includes(kind) || !['preview', 'production'].includes(environment)) fail('ON_DEMAND_TARGET_REQUIRED');
  return { sourceDirectory: `.vercel/continuous-on-demand-v2-${kind}-${environment}-source`, manifest: `docs/evidence/continuous-on-demand-v2-${kind}-${environment}-source-2026-10-11.json` };
}
function confined(root, path) {
  const target = resolve(root, path), rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) fail('ON_DEMAND_SOURCE_BOUNDARY');
  return target;
}
export async function readPlainOnDemandSource(root, path) {
  root = resolve(root); const target = confined(root, path), parts = relative(root, target).split(sep);
  if (parts.some(part => /^\.env/i.test(part) || /\.(?:dpapi|pem|key|pfx|p12|log)$/i.test(part) || ['private', '.aws', '.git', '.codex', '.agents'].includes(part))) fail('PRIVATE_ON_DEMAND_SOURCE_DENIED');
  let cursor = root;
  if ((await lstat(root)).isSymbolicLink()) fail('PLAIN_ON_DEMAND_SOURCE_REQUIRED');
  for (const part of parts) { cursor = resolve(cursor, part); if ((await lstat(cursor)).isSymbolicLink()) fail('PLAIN_ON_DEMAND_SOURCE_REQUIRED'); }
  if (!(await lstat(target)).isFile()) fail('PLAIN_ON_DEMAND_SOURCE_REQUIRED');
  return readFile(target);
}
function publicTarget(kind, path) {
  if (typeof path !== 'string' || path.includes('\\') || path.startsWith('/') || path.split('/').some(part => !part || ['.', '..', 'private', '.vercel', '.git', '.aws', '.codex', '.agents'].includes(part) || /^\.env/i.test(part)) || /\.(?:dpapi|pem|key|pfx|p12|log|tsbuildinfo)$/i.test(path)) return false;
  return kind === 'bazaar' ? safeSourcePath(path) : /^(?:seller\/[a-zA-Z0-9._-]+|src\/[a-zA-Z0-9._/-]+|[a-zA-Z0-9._-]+)$/.test(path);
}
export function onDemandVercelConfiguration(kind, environment, original) {
  onDemandTargets(kind, environment);
  const before = JSON.parse(Buffer.from(original).toString('utf8'));
  const expected = [{ path: kind === 'bazaar' ? '/api/market/guardian/tick' : '/api/bazaar/seller/tick', schedule: kind === 'bazaar' ? '*/15 * * * *' : '*/2 * * * *' }];
  if (JSON.stringify(before.crons) !== JSON.stringify(expected) || JSON.stringify(before.regions) !== JSON.stringify(['iad1']) || before.functions?.[kind === 'bazaar' ? 'app/api/**/route.ts' : 'server.ts']?.maxDuration !== 60) fail('EXACT_APPROVED_CRON_BASE_REQUIRED');
  const crons = environment === 'preview' || kind === 'provider' ? [] : [{ path: expected[0].path, schedule: '0 * * * *' }];
  return Buffer.from(JSON.stringify({ ...before, crons }, null, 2) + '\n');
}
/** Ensure newly added relative imports cannot be omitted from a frozen pack.
 * Runtime input still comes only from the explicit reviewed overlay allowlist. */
export function validateOnDemandDependencies(buffers){
 for(const [path,bytes]of buffers){
  if(!/\.(?:ts|tsx|js|mjs|mts)$/.test(path))continue;
  const source=bytes.toString('utf8'),imports=[...source.matchAll(/(?:from\s*|import\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+|@\/[^'"]+)\1/g)].map(match=>match[2]);
  for(const specifier of imports){
   const target=posix.normalize(specifier.startsWith('@/')?specifier.slice(2):posix.join(posix.dirname(path),specifier));
   // Next generates this declaration during build; it is not runtime input.
   if(path==='next-env.d.ts'&&['.next/types/routes.d.ts','.next/types/root-params.d.ts'].includes(target))continue;
   if(target==='..'||target.startsWith('../')||target.startsWith('/'))fail('ON_DEMAND_DEPENDENCY_BOUNDARY');
   const candidates=[target,target+'.ts',target+'.tsx',target+'.js',target+'.mjs',target+'.json',target+'/index.ts',target+'/index.tsx',target+'/index.js'];
   if(target.endsWith('.js'))candidates.push(target.slice(0,-3)+'.ts',target.slice(0,-3)+'.tsx');
   if(!candidates.some(candidate=>buffers.has(candidate)))throw Object.assign(Error('MISSING_ON_DEMAND_SOURCE_DEPENDENCY'),{publicDependency:{source:path,dependency:target}});
  }
 }
 return true;
}
export function validateOnDemandCandidate(manifest, buffers, baseFiles, baseBuffers) {
  const { kind, environment } = manifest, targets = onDemandTargets(kind, environment), allowed = new Set([...Object.keys(ON_DEMAND_OVERLAYS[kind]), 'vercel.json']);
  if (manifest.status !== 'ON_DEMAND_LOCAL_NOT_APPLIED' || manifest.sourceDirectory !== targets.sourceDirectory || manifest.manifest !== targets.manifest || manifest.previewAcceptancePending !== true || manifest.realPayments !== 0 || manifest.productionPublished !== false || manifest.cronActivated !== false || manifest.environmentApplied !== false || manifest.privateFilesIncluded!==0 || manifest.credentialsCopied!==false || manifest.networkRequests!==0 || manifest.operationMode !== 'continuous-on-demand' || manifest.hasAdmissionDeadline !== false) fail('ON_DEMAND_MANIFEST_SCOPE_CHANGED');
  const expected = new Set([...baseFiles.map(file => file.path), ...Object.keys(ON_DEMAND_OVERLAYS[kind])]);
  const originals = new Map(baseFiles.map(file => [file.path, file]));
  if (!Array.isArray(manifest.files) || manifest.files.length !== expected.size || buffers.size !== expected.size) fail('ON_DEMAND_FILE_SET_CHANGED');
  const changes = [];
  for (const file of manifest.files) {
    if (!publicTarget(kind, file.path) || !expected.delete(file.path)) fail('ON_DEMAND_FILE_SET_CHANGED');
    const bytes = buffers.get(file.path), before = originals.get(file.path);
    if (!Buffer.isBuffer(bytes) || bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail('ON_DEMAND_SOURCE_BYTES_CHANGED');
    if (before && (sha(baseBuffers.get(file.path)) !== before.sha256 || baseBuffers.get(file.path).length !== before.bytes)) fail('ON_DEMAND_BASE_BYTES_CHANGED');
    if (!before || before.sha256 !== file.sha256 || before.bytes !== file.bytes) {
      if (!allowed.has(file.path)) fail('ON_DEMAND_OVERLAY_SCOPE_CHANGED');
      changes.push({ path: file.path, beforeSha256: before?.sha256 ?? null, afterSha256: file.sha256, added: !before, overlaySource: file.path === 'vercel.json' ? 'local-cron-configuration-only' : ON_DEMAND_OVERLAYS[kind][file.path] });
    }
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  if (expected.size || sourceDigest(manifest.files) !== manifest.sourceDigest || manifest.candidate !== `continuous-on-demand-v2-${kind}-${environment}-${manifest.sourceDigest.slice(0, 16)}` || JSON.stringify(changes) !== JSON.stringify(manifest.changes) || manifest.changedSourceFiles !== changes.length || manifest.identicalSourceFiles !== manifest.files.length - changes.length || manifest.addedSourceFiles !== changes.filter(change => change.added).length) fail('ON_DEMAND_MANIFEST_DIGEST_CHANGED');
  const config = onDemandVercelConfiguration(kind, environment, baseBuffers.get('vercel.json'));
  if (!buffers.get('vercel.json').equals(config) || JSON.stringify(manifest.cronSchedules) !== JSON.stringify(JSON.parse(config).crons)) fail('ON_DEMAND_CRON_SCOPE_CHANGED');
  if (JSON.stringify(manifest.base) !== JSON.stringify(ON_DEMAND_BASES[kind])) fail('ON_DEMAND_BASE_BINDING_CHANGED');
  return true;
}
async function readApprovedBases(root) {
  const verifications = await Promise.all([verifyProductionSource(root), verifyProviderProductionSource(root)]);
  const bases = {};
  for (const [index, kind] of ['bazaar', 'provider'].entries()) {
    const binding = ON_DEMAND_BASES[kind], verification = verifications[index];
    if ((verification.effectiveSourceDigest ?? verification.sourceDigest) !== binding.sourceDigest || verification.manifestSha256 !== binding.manifestSha256 || verification.files !== binding.files) fail('EXACT_APPROVED_ON_DEMAND_BASE_REQUIRED');
    const raw = await readPlainOnDemandSource(root, binding.manifest);
    if (sha(raw) !== binding.manifestSha256) fail('EXACT_APPROVED_ON_DEMAND_BASE_REQUIRED');
    const base = JSON.parse(raw), buffers = new Map();
    for (const file of base.files) {
      if (!publicTarget(kind, file.path) || buffers.has(file.path)) fail('ON_DEMAND_BASE_FILE_SET_CHANGED');
      const bytes = await readPlainOnDemandSource(root, `${binding.sourceDirectory}/${file.path}`);
      if (sha(bytes) !== file.sha256 || bytes.length !== file.bytes) fail('ON_DEMAND_BASE_BYTES_CHANGED');
      buffers.set(file.path, bytes);
    }
    bases[kind] = { files: base.files, buffers };
  }
  return bases;
}
function sourcePreparationPlan(candidates) { return { version: 1, status: 'ON_DEMAND_LOCAL_SOURCE_PLAN', operationMode: 'continuous-on-demand', hasAdmissionDeadline: false, providerScheduledPolling: false, nonSecretConfiguration: {bazaar:{BAZAAR_FREE_DEMO_MODE:'continuous'},provider:{BAZAAR_SELLER_EXECUTION_MODE:'on-demand'}}, removeDeadlineEnvironment:['BAZAAR_FREE_DEMO_ADMISSION_UNTIL'], candidates, approvedSourcesModified: false, previewAcceptancePending: true, realPayments: 0, networkRequests: 0, cloudWrites: 0 }; }
export function validateV2ArchiveCreditDifference(kind,files,priorFiles,priorBytes,currentBytes){
 if(JSON.stringify(files.map(f=>f.path).sort())!==JSON.stringify(priorFiles.map(f=>f.path).sort()))fail('V2_SAME_FILE_INVENTORY_REQUIRED');
 const prior=new Map(priorFiles.map(f=>[f.path,f])),changed=files.filter(f=>prior.get(f.path).sha256!==f.sha256||prior.get(f.path).bytes!==f.bytes).map(f=>f.path).sort();
 if(JSON.stringify(changed)!==JSON.stringify(kind==='bazaar'?['lib/demo-http.ts']:[]))fail('ONLY_ARCHIVED_RECOVERY_CREDIT_PATCH_ALLOWED');
 if(kind==='bazaar'){const old=priorBytes.toString('utf8'),needle='s.orders.find(o=>o.operationId===id));',replacement='s.orders.find(o=>o.operationId===id)??s.archived?.find(o=>o.operationId===id));';if(old.split(needle).length!==2||!Buffer.from(old.replace(needle,replacement)).equals(currentBytes))fail('EXACT_SINGLE_ARCHIVED_RECOVERY_CREDIT_LINE_REQUIRED');}
 return changed;
}
async function v2RevisionProofs(root,candidates,bufferSets){
 const previous=await verifyRevisionOneSources(root),proofs=[];
 for(const candidate of candidates){const old=previous.outputs.find(s=>s.kind===candidate.kind&&s.environment===candidate.environment),manifest=JSON.parse(await readPlainOnDemandSource(root,old.manifest));const path='lib/demo-http.ts',priorBytes=candidate.kind==='bazaar'?await readPlainOnDemandSource(root,old.sourceDirectory+'/'+path):undefined,currentBytes=candidate.kind==='bazaar'?bufferSets.get(candidate.kind+':'+candidate.environment).get(path):undefined;const changedPaths=validateV2ArchiveCreditDifference(candidate.kind,candidate.files,manifest.files,priorBytes,currentBytes);proofs.push({releaseRevision:2,previousSourceDirectory:old.sourceDirectory,previousSourceDigest:old.sourceDigest,previousManifestSha256:old.manifestSha256,changedPaths,otherSourceBytesUnchanged:true,oldSnapshotsUnmodified:true});}
 return proofs;
}
export async function inspectOnDemandSources(root = process.cwd()) {
  root = resolve(root); const bases = await readApprovedBases(root), candidates = [], bufferSets = new Map();
  for (const kind of ['bazaar', 'provider']) {
    const overlays = new Map();
    for (const [target, source] of Object.entries(ON_DEMAND_OVERLAYS[kind])) overlays.set(target, await readPlainOnDemandSource(root, source));
    for (const environment of ['preview', 'production']) {
      const targets = onDemandTargets(kind, environment), buffers = new Map(bases[kind].buffers);
      for (const [path, bytes] of overlays) buffers.set(path, bytes);
      buffers.set('vercel.json', onDemandVercelConfiguration(kind, environment, bases[kind].buffers.get('vercel.json')));
      validateOnDemandDependencies(buffers);
      const files = [...buffers].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })).sort((a, b) => a.path.localeCompare(b.path)), digest = sourceDigest(files);
      const original = new Map(bases[kind].files.map(file => [file.path, file]));
      const changes = files.filter(file => !original.has(file.path) || original.get(file.path).sha256 !== file.sha256 || original.get(file.path).bytes !== file.bytes).map(file => ({ path: file.path, beforeSha256: original.get(file.path)?.sha256 ?? null, afterSha256: file.sha256, added: !original.has(file.path), overlaySource: file.path === 'vercel.json' ? 'local-cron-configuration-only' : ON_DEMAND_OVERLAYS[kind][file.path] }));
      const manifest = { version: 1, status: 'ON_DEMAND_LOCAL_NOT_APPLIED', kind, environment, ...targets, candidate: `continuous-on-demand-v2-${kind}-${environment}-${digest.slice(0, 16)}`, sourceDigest: digest, base: ON_DEMAND_BASES[kind], files, changes, identicalSourceFiles: files.length - changes.length, changedSourceFiles: changes.length, addedSourceFiles: changes.filter(change => change.added).length, cronSchedules: JSON.parse(buffers.get('vercel.json')).crons, operationMode: 'continuous-on-demand', hasAdmissionDeadline: false, previewAcceptancePending: true, realPayments: 0, privateFilesIncluded: 0, credentialsCopied: false, productionPublished: false, cronActivated: false, environmentApplied: false, networkRequests: 0 };
      validateOnDemandCandidate(manifest, buffers, bases[kind].files, bases[kind].buffers);
      candidates.push(manifest); bufferSets.set(kind + ':' + environment, buffers);
    }
  }
  const revisions=await v2RevisionProofs(root,candidates,bufferSets);for(let i=0;i<candidates.length;i++)candidates[i].revisionProof=revisions[i];
  const plan = sourcePreparationPlan(candidates);
  const planDigest = sha(Buffer.from(JSON.stringify(plan)));
  return { plan: { ...plan, planDigest }, bufferSets, bases };
}
async function absent(root, path) { try { await lstat(confined(root, path)); fail('NEW_ON_DEMAND_OUTPUT_REQUIRED'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
export async function prepareOnDemandSources(root, expectedPlanDigest) {
  root = resolve(root); const inspected = await inspectOnDemandSources(root);
  if (!/^[a-f0-9]{64}$/.test(expectedPlanDigest ?? '') || expectedPlanDigest !== inspected.plan.planDigest) fail('EXACT_ON_DEMAND_PLAN_REQUIRED');
  for (const manifest of inspected.plan.candidates) { await absent(root, manifest.sourceDirectory); await absent(root, manifest.manifest); }
  // All four targets are checked before any output. Existing artifacts are
  // never replaced or cleaned up automatically after an uncertain local write.
  for (const path of ['.vercel', 'docs', 'docs/evidence']) if (!(await lstat(confined(root, path))).isDirectory() || (await lstat(confined(root, path))).isSymbolicLink()) fail('PLAIN_ON_DEMAND_PARENT_REQUIRED');
  const outputs = [];
  for (const manifest of inspected.plan.candidates) {
    const output = confined(root, manifest.sourceDirectory), buffers = inspected.bufferSets.get(manifest.kind + ':' + manifest.environment);
    await mkdir(output);
    for (const file of manifest.files) { const destination = confined(output, file.path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, buffers.get(file.path), { flag: 'wx' }); }
    const bytes = Buffer.from(JSON.stringify({ ...manifest, preparationPlanDigest: inspected.plan.planDigest, preparedAt: new Date().toISOString() }, null, 2) + '\n');
    await writeFile(confined(root, manifest.manifest), bytes, { flag: 'wx', mode: 0o600 });
    outputs.push({ kind: manifest.kind, environment: manifest.environment, sourceDirectory: manifest.sourceDirectory, sourceDigest: manifest.sourceDigest, manifest: manifest.manifest, manifestSha256: sha(bytes), files: manifest.files.length, changedSourceFiles: manifest.changedSourceFiles, addedSourceFiles: manifest.addedSourceFiles, cronSchedules: manifest.cronSchedules });
  }
  return { status: 'ON_DEMAND_LOCAL_NOT_APPLIED', planDigest: inspected.plan.planDigest, outputs, approvedSourcesModified: false, previewAcceptancePending: true, realPayments: 0, networkRequests: 0, deployments: 0, cronActivated: false };
}
async function inventory(directory, prefix = '') {
  const paths = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) fail('PLAIN_ON_DEMAND_SOURCE_REQUIRED');
    if (entry.isDirectory()) paths.push(...await inventory(directory, path)); else if (entry.isFile()) paths.push(path); else fail('PLAIN_ON_DEMAND_SOURCE_REQUIRED');
  }
  return paths;
}
export async function verifyOnDemandSources(root = process.cwd()) {
  root = resolve(root); const bases = await readApprovedBases(root), outputs = [], candidates = [],bufferSets=new Map();
  for (const kind of ['bazaar', 'provider']) for (const environment of ['preview', 'production']) {
    const targets = onDemandTargets(kind, environment), bytes = await readPlainOnDemandSource(root, targets.manifest), manifest = JSON.parse(bytes), buffers = new Map();
    const paths = await inventory(confined(root, targets.sourceDirectory));
    if (paths.length !== manifest.files.length || paths.some(path => !manifest.files.some(file => file.path === path))) fail('UNMANIFESTED_ON_DEMAND_SOURCE');
    for (const file of manifest.files) buffers.set(file.path, await readPlainOnDemandSource(root, `${targets.sourceDirectory}/${file.path}`));
    validateOnDemandCandidate(manifest, buffers, bases[kind].files, bases[kind].buffers);bufferSets.set(kind+':'+environment,buffers);
    if (!/^[a-f0-9]{64}$/.test(manifest.preparationPlanDigest ?? '') || !Number.isFinite(Date.parse(manifest.preparedAt ?? ''))) fail('ON_DEMAND_PREPARATION_PROOF_REQUIRED');
    const { preparationPlanDigest, preparedAt, ...candidate } = manifest; candidates.push(candidate);
    outputs.push({ kind, environment, sourceDirectory: targets.sourceDirectory, sourceDigest: manifest.sourceDigest, manifest: targets.manifest, manifestSha256: sha(bytes), preparationPlanDigest: manifest.preparationPlanDigest, files: manifest.files.length, changedSourceFiles: manifest.changedSourceFiles, addedSourceFiles: manifest.addedSourceFiles, cronSchedules: manifest.cronSchedules });
  }
  const revisions=await v2RevisionProofs(root,candidates,bufferSets);for(let i=0;i<candidates.length;i++)if(JSON.stringify(candidates[i].revisionProof)!==JSON.stringify(revisions[i]))fail('EXACT_V2_PARENT_DIFF_PROOF_REQUIRED');
  if (new Set(outputs.map(output => output.preparationPlanDigest)).size !== 1) fail('ONE_ON_DEMAND_PREPARATION_PLAN_REQUIRED');
  if (sha(Buffer.from(JSON.stringify(sourcePreparationPlan(candidates)))) !== outputs[0].preparationPlanDigest) fail('ON_DEMAND_PREPARATION_PLAN_CHANGED');
  return { status: 'ON_DEMAND_LOCAL_SOURCES_VERIFIED', outputs, approvedSourcesModified: false, previewAcceptancePending: true, realPayments: 0, networkRequests: 0, deployments: 0, cronActivated: false };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const action = process.argv[2];
    if (!['inspect', 'prepare', 'verify'].includes(action) || process.argv.length !== (action === 'prepare' ? 4 : 3)) fail('OFFLINE_ON_DEMAND_SOURCE_ACTION_REQUIRED');
    const result = action === 'inspect' ? (await inspectOnDemandSources()).plan : action === 'prepare' ? await prepareOnDemandSources(process.cwd(), process.argv[3]) : await verifyOnDemandSources();
    console.log(JSON.stringify(action === 'inspect' ? { ...result, candidates: result.candidates.map(candidate => ({ ...candidate, files: candidate.files.length })) } : result));
  } catch (error) { console.error(JSON.stringify({ status: 'UNCONFIRMED', code: /^[A-Z][A-Z0-9_]{1,95}$/.test(error?.message ?? '') ? error.message : 'ON_DEMAND_SOURCE_UNCONFIRMED', ...(error.publicDependency?{publicDependency:error.publicDependency}:{}), cloudWrites: 0, deployments: 0 })); process.exitCode = 1; }
}
