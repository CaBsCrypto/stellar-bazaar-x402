// Local source preparation only: no cloud API, environment export or deployment.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, lstat, realpath, symlink } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BASE_MANIFEST = 'docs/evidence/service-discovery-source-2026-10-11.json';
export const BASE_MANIFEST_SHA256 = 'b3f0989ba44d07da248cb2a9dc83fe87154a0a4ddb3de99d972a3c346d12e94f';
export const DEFAULT_SOURCE = '.vercel/hackathon-functional-preview-source';
export const DEFAULT_MANIFEST = 'docs/evidence/hackathon-functional-preview-source-2026-10-11.json';
// This reviewed list is deliberately explicit. Runtime additions require review here.
export const OVERLAYS = [
  'app/api/market/review/route.ts', 'app/api/market/guardian/tick/route.ts', 'app/market-review/page.tsx',
  'components/MarketReview.tsx', 'lib/bazaar-skills.ts', 'lib/demo-configuration.ts',
  'lib/demo-instructions.ts', 'lib/market-guardian.ts', 'lib/market-guardian-cron.ts', 'lib/market-purchase-admission.ts', 'lib/market-review-access.ts',
  'lib/marketplace-http.ts', 'lib/marketplace-x402.ts', 'lib/marketplace.ts',
  'lib/mcp-onboarding-server.ts', 'lib/pilot-route-policy.ts', 'lib/operational-route-gate.ts',
  'lib/acceptance-meter.ts', 'lib/operational-pressure.ts', 'lib/operational-envelopes.ts', 'lib/operational-budget.ts',
  'package.json', 'package-lock.json', '.vercelignore', 'public/AGENT_CONNECTION.md',
  'public/PROVIDER_ONBOARDING.md', 'public/SELLER_AGENT_KIT.md', 'public/BUYER_AGENT_KIT.md',
  'public/examples/native-text-service-card.json',
  'public/downloads/bazaar-native-text-provider-kit.tgz',
  'public/downloads/bazaar-native-text-provider-kit.manifest.json',
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Error(code); };
export function safeSourcePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.startsWith('/') || path.split('/').some(v => !v || v === '.' || v === '..')) return false;
  if (path.split('/').some(v => /^\.(?:git|vercel|aws|codex|agents)$/.test(v) || ['build-provenance', 'private'].includes(v))) return false;
  if (path.split('/').some(v => /^\.env/.test(v)) || /\.(?:dpapi|pem|key|pfx|p12|log|tsbuildinfo)$/i.test(path)) return false;
  return /^(?:app\/|components\/|lib\/|public\/|styles\/|[a-z][a-z0-9.-]*\.[a-z0-9]+$|\.(?:vercelignore|gitattributes|gitignore)$|LICENSE$)/i.test(path);
}
function confined(root, path) {
  const target = resolve(root, path), rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) fail('WORKSPACE_PATH_REQUIRED');
  return target;
}
async function plainRead(root, path) {
  const target = confined(root, path);
  // Do not follow directory junctions or file symlinks into private material.
  const parts = relative(root, target).split(sep); let current = root;
  for (const part of parts) { current = resolve(current, part); if ((await lstat(current)).isSymbolicLink()) fail('PLAIN_SOURCE_REQUIRED'); }
  return readFile(target);
}
export function sourceDigest(files) {
  return sha(Buffer.from([...files].sort((a,b) => a.path.localeCompare(b.path)).map(v => v.path + '\0' + v.sha256 + '\0' + v.bytes).join('\n')));
}
async function inventory(root, prefix = '') {
  const paths = [];
  for (const item of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + item.name : item.name;
    if (item.isSymbolicLink()) fail('UNREVIEWED_SOURCE_LINK');
    if (item.isDirectory()) paths.push(...await inventory(root, path)); else paths.push(path);
  }
  return paths;
}
export async function inspect(root = process.cwd()) {
  root = resolve(root);
  const manifestBytes = await plainRead(root, BASE_MANIFEST);
  if (sha(manifestBytes) !== BASE_MANIFEST_SHA256) fail('ACCEPTED_MANIFEST_CHANGED');
  const base = JSON.parse(manifestBytes);
  if (base.status !== 'FROZEN_PROTECTED_PREVIEW_SOURCE' || base.sourceDirectory !== '.vercel/service-discovery-preview-source' || base.files.length !== 1242) fail('ACCEPTED_SOURCE_REQUIRED');
  const sourceRoot = confined(root, base.sourceDirectory), records = new Map(), basePaths = new Set();
  for (const file of base.files) {
    // Only names from the immutable, hash-pinned accepted manifest are read.
    const bytes = await plainRead(sourceRoot, file.path);
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail('ACCEPTED_SOURCE_CHANGED');
    basePaths.add(file.path);
    if (file.excludedFromDeployment !== true && !/^(?:scripts|docs|examples|contracts|\.github)\//.test(file.path)) {
      if (!safeSourcePath(file.path)) fail('PRIVATE_BASE_SOURCE_REJECTED');
      records.set(file.path, { path: file.path, bytes: bytes.length, sha256: sha(bytes), source: 'accepted-base' });
    }
  }
  const overlays = [];
  for (const path of OVERLAYS) {
    if (!safeSourcePath(path) || path === 'vercel.json') fail('REVIEWED_OVERLAY_REQUIRED');
    const bytes = await plainRead(root, path), record = { path, bytes: bytes.length, sha256: sha(bytes), source: 'reviewed-overlay' };
    overlays.push(record); records.set(path, record);
  }
  // Detect semantic runtime edits omitted from the explicit overlay list; CRLF alone is harmless.
  const unreviewed = [];
  for (const directory of ['app','components','lib','public']) for (const path of await inventory(root, directory)) {
    if (OVERLAYS.includes(path)) continue;
    if (!basePaths.has(path)) { unreviewed.push(path); continue; }
    const before = await plainRead(sourceRoot, path), after = await plainRead(root, path);
    if (before.toString('utf8').replace(/\r\n/g,'\n') !== after.toString('utf8').replace(/\r\n/g,'\n')) unreviewed.push(path);
  }
  if (unreviewed.length) { const error = Error('UNREVIEWED_RUNTIME_CHANGES'); error.paths = unreviewed.sort(); throw error; }
  const config = JSON.parse(await plainRead(sourceRoot, 'vercel.json'));
  if (!Array.isArray(config.crons) || config.crons.length) fail('NO_CRON_REQUIRED');
  const files = [...records.values()].sort((a,b) => a.path.localeCompare(b.path));
  const effectiveSourceDigest = sourceDigest(files);
  return { version: 1, status: 'LOCAL_PREVIEW_SOURCE_PLAN', baseCandidate: base.baseCandidate,
    baseManifest: BASE_MANIFEST, baseManifestSha256: BASE_MANIFEST_SHA256,
    baseEffectiveSourceDigest: base.effectiveSourceDigest, baseFileCount: base.files.length,
    baseUploadableFileCount: base.files.filter(v => v.excludedFromDeployment !== true).length,
    baseRuntimeFileCount: files.filter(v => v.source === 'accepted-base').length + overlays.filter(v => basePaths.has(v.path)).length,
    excludedBaseFileCount: base.files.filter(v => v.excludedFromDeployment === true).length,
    candidate: 'hackathon-functional-' + effectiveSourceDigest.slice(0,16), effectiveSourceDigest,
    planDigest: sha(Buffer.from(JSON.stringify({baseManifestSha256:BASE_MANIFEST_SHA256,files}))),
    overlays: OVERLAYS, overlayFiles: overlays, files, cronSchedules: [],
    privateFilesIncluded: 0, productionPublished: false, newPayments: 0 };
}
export async function freeze(root, sourceDirectory, manifestPath, expectedPlanDigest) {
  root = resolve(root); const plan = await inspect(root);
  if (!/^[a-f0-9]{64}$/.test(expectedPlanDigest ?? '') || plan.planDigest !== expectedPlanDigest) fail('REVIEWED_PLAN_DIGEST_REQUIRED');
  if (!/^\.vercel\/[a-z0-9-]+$/.test(sourceDirectory) || sourceDirectory === '.vercel/service-discovery-preview-source') fail('NEW_SOURCE_DIRECTORY_REQUIRED');
  if (!/^docs\/evidence\/[a-z0-9-]+\.json$/.test(manifestPath) || manifestPath === BASE_MANIFEST) fail('NEW_MANIFEST_PATH_REQUIRED');
  const output = confined(root, sourceDirectory), manifestTarget = confined(root, manifestPath);
  await mkdir(output); // Exclusive creation; never replace another candidate.
  for (const file of plan.files) {
    const base = file.source === 'accepted-base' ? resolve(root,'.vercel/service-discovery-preview-source') : root;
    const bytes = await plainRead(base,file.path);
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail('SOURCE_CHANGED_DURING_FREEZE');
    const target = confined(output,file.path); await mkdir(dirname(target),{recursive:true}); await writeFile(target,bytes,{flag:'wx'});
  }
  const manifest = { ...plan, status:'FROZEN_PROTECTED_PREVIEW_SOURCE', sourceDirectory, observedAt:new Date().toISOString() };
  await writeFile(manifestTarget,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return { manifest, manifestSha256:sha(await readFile(manifestTarget)) };
}
export async function verify(root, manifestPath = DEFAULT_MANIFEST) {
  root = resolve(root); const manifestBytes = await plainRead(root,manifestPath), manifest = JSON.parse(manifestBytes);
  if (manifest.status !== 'FROZEN_PROTECTED_PREVIEW_SOURCE' || manifest.baseManifestSha256 !== BASE_MANIFEST_SHA256 || !/^\.vercel\/[a-z0-9-]+$/.test(manifest.sourceDirectory)) fail('FROZEN_MANIFEST_REQUIRED');
  const source = confined(root,manifest.sourceDirectory), expected = new Set();
  for (const file of manifest.files) {
    if (!safeSourcePath(file.path) || expected.has(file.path)) fail('SAFE_UNIQUE_SOURCE_REQUIRED');
    expected.add(file.path); const bytes = await plainRead(source,file.path);
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail('FROZEN_SOURCE_CHANGED');
  }
  const actual = await readdir(source,{withFileTypes:true});
  for (const item of actual) {
    if (['node_modules','.next'].includes(item.name)) continue; // Explicit ignored build artifacts, never uploaded.
    if (item.name === '.vercel') {
      if (item.isSymbolicLink()) fail('PRIVATE_CONTROL_LINK_REJECTED');
      const controls = await readdir(resolve(source,'.vercel'));
      if (controls.some(name => name !== 'project.json')) fail('PRIVATE_CONTROL_FILES_REJECTED');
      continue;
    }
    const paths = item.isDirectory() ? await inventory(source,item.name) : [item.name];
    if (paths.some(path => !expected.has(path))) fail('UNMANIFESTED_DEPLOYMENT_FILE');
  }
  const config = JSON.parse(await plainRead(source,'vercel.json'));
  if (!Array.isArray(config.crons) || config.crons.length || sourceDigest(manifest.files) !== manifest.effectiveSourceDigest) fail('FROZEN_POLICY_CHANGED');
  const ignored = (await plainRead(source,'.vercelignore')).toString('utf8').split(/\r?\n/);
  if (!['.vercel','node_modules','.next','.env*','build-provenance'].every(v => ignored.includes(v))) fail('PRIVATE_EXCLUSIONS_REQUIRED');
  return { status:'FROZEN_SOURCE_VERIFIED', candidate:manifest.candidate, sourceDirectory:manifest.sourceDirectory,
    manifestPath, manifestSha256:sha(manifestBytes), effectiveSourceDigest:manifest.effectiveSourceDigest,
    files:manifest.files.length, cronSchedules:[], privateFilesIncluded:0, productionPublished:false };
}
export async function linkBuildDependencies(root, manifestPath = DEFAULT_MANIFEST) {
  const checked = await verify(root,manifestPath), source = confined(resolve(root),checked.sourceDirectory);
  const dependency = resolve(root,'node_modules');
  if (await realpath(dependency) !== dependency || !(await lstat(dependency)).isDirectory()) fail('LOCAL_DEPENDENCIES_REQUIRED');
  await symlink(dependency,resolve(source,'node_modules'),process.platform === 'win32' ? 'junction' : 'dir');
  return {status:'IGNORED_BUILD_DEPENDENCIES_LINKED',candidate:checked.candidate,filesCopied:0,environmentFilesCopied:0};
}
async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === 'inspect' && !arg) console.log(JSON.stringify(await inspect(),null,2));
  else if (command === 'freeze' && process.argv.length === 4) {
    const result = await freeze(process.cwd(),DEFAULT_SOURCE,DEFAULT_MANIFEST,arg);
    console.log(JSON.stringify({status:result.manifest.status,candidate:result.manifest.candidate,sourceDirectory:DEFAULT_SOURCE,manifestPath:DEFAULT_MANIFEST,manifestSha256:result.manifestSha256,files:result.manifest.files.length,effectiveSourceDigest:result.manifest.effectiveSourceDigest,cronSchedules:[],productionPublished:false}));
  } else if (command === 'verify' && process.argv.length <= 4) console.log(JSON.stringify(await verify(process.cwd(),arg)));
  else if (command === 'link-build-dependencies' && process.argv.length <= 4) console.log(JSON.stringify(await linkBuildDependencies(process.cwd(),arg)));
  else fail('EXACT_LOCAL_ACTION_REQUIRED');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(JSON.stringify({status:'FAIL',code:/^[A-Z0-9_]+$/.test(error.message ?? '')?error.message:'LOCAL_SOURCE_UNCONFIRMED',...(error.paths?{paths:error.paths}: {})}));process.exitCode=1;
});
