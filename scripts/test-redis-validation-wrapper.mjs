// Windows DPAPI + NTFS tests with synthetic profiles only. Every Check/Save call
// uses the actual validator's no-network mode. Execute is tested in a disposable
// local checkout containing a synthetic child; it cannot contact Redis.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile, rm, lstat} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

if (process.platform !== 'win32') { console.log(JSON.stringify({status: 'NOT_APPLICABLE', reason: 'WINDOWS_DPAPI_REQUIRED', externalRequests: 0})); process.exit(0); }
const checkout = fileURLToPath(new URL('..', import.meta.url));
const privateDirectory = resolve(checkout, '.vercel');
const wrapper = resolve(checkout, 'scripts/invoke-redis-isolated-validation.ps1');
const nonce = randomBytes(16).toString('hex');
const privatePath = join(privateDirectory, 'redis-validation-synthetic-' + nonce + '.dpapi');
const lockPath = privatePath.replace(/\.dpapi$/, '.lock');
const scratch = join(privateDirectory, 'redis-wrapper-fixture-' + randomBytes(16).toString('hex'));
const token = 'SYNTHETIC_VALIDATION_TOKEN_' + randomBytes(32).toString('hex');
const now = Date.now();
const pending = {version: 1, purpose: 'bazaar-local-redis-validation', mode: 'temporary-exclusive', phase: 'pending', databaseId: randomUUID(), localLabel: 'bazaar-local-validation-' + randomBytes(8).toString('hex'), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 3600000).toISOString(), basis: 'upstash-unclaimed-three-days'};
const ready = {...pending, phase: 'ready', url: 'https://synthetic-wrapper-validation.upstash.io', token};
let scenarios = 0;
const existing = async path => { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } };
async function powershell(args, input = '', options = {}) {
  return await new Promise((accept, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], cwd: checkout, ...options});
    const stdout = [], stderr = []; let bytes = 0;
    const timeout = setTimeout(() => { child.kill(); reject(Error('SYNTHETIC_LOCAL_TEST_TIMEOUT')); }, 60000);
    child.stdout.on('data', part => { bytes += part.length; if (bytes > 32768) child.kill(); else stdout.push(part); });
    child.stderr.on('data', part => { bytes += part.length; if (bytes > 32768) child.kill(); else stderr.push(part); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); accept({code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8')}); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
async function run(mode, profile, options = {}) {
  const path = options.wrapper ?? wrapper;
  const args = ['-File', path, '-Mode', mode, ...(options.defaultPath ? [] : ['-SyntheticNonce', nonce])];
  const result = await powershell(args, profile === undefined ? '' : typeof profile === 'string' ? profile : JSON.stringify(profile), options.env ? {env: options.env} : {});
  for (const secret of [token, pending.databaseId, pending.localLabel, ready.url, 'SYNTHETIC_PRIVATE_CHILD_DIAGNOSTIC']) {
    assert.equal(result.stdout.includes(secret), false, 'stdout must contain no private synthetic field');
    assert.equal(result.stderr.includes(secret), false, 'stderr must contain no private synthetic field');
  }
  assert.equal(result.stderr, '', 'wrapper failures emit one generic JSON report only');
  return {...result, report: JSON.parse(result.stdout)};
}
function pass(result) { assert.equal(result.code, 0, JSON.stringify(result.report)); assert.equal(result.report.status, 'PASS'); scenarios++; }
function fail(result) { assert.notEqual(result.code, 0); assert.equal(result.report.status, 'FAIL'); scenarios++; }
async function exactRemove(path) {
  assert.equal(dirname(resolve(path)), privateDirectory);
  assert.ok([privatePath, lockPath].includes(resolve(path)));
  const info = await existing(path); if (!info) return;
  assert.equal(info.isSymbolicLink(), false); assert.equal(info.isFile(), true);
  await rm(path);
}

try {
  assert.equal(await existing(privatePath), undefined);
  pass(await run('SavePending', pending));
  const originalPending = await readFile(privatePath);
  assert.equal(originalPending.includes(Buffer.from(pending.databaseId)), false);
  fail(await run('Check')); // Pending profiles cannot validate or execute as ready.
  fail(await run('SavePending', pending)); // No implicit overwrite.
  assert.deepEqual(await readFile(privatePath), originalPending);
  fail(await run('Complete', {...ready, databaseId: randomUUID()}));
  assert.deepEqual(await readFile(privatePath), originalPending);
  pass(await run('Complete', ready));
  pass(await run('Check'));
  const encrypted = await readFile(privatePath);
  for (const secret of [token, pending.databaseId, ready.url, pending.localLabel]) assert.equal(encrypted.includes(Buffer.from(secret)), false);

  const aclScript = '$ErrorActionPreference="Stop";$p=[Console]::In.ReadToEnd();$a=[IO.File]::GetAccessControl($p);$u=[Security.Principal.WindowsIdentity]::GetCurrent().User;$r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));$ok=$a.AreAccessRulesProtected -and $r.Count -eq 2 -and @($r|Where-Object {$_.IdentityReference.Value -notin @($u.Value,"S-1-5-18") -or $_.IsInherited -or $_.AccessControlType -ne "Allow"}).Count -eq 0;[Console]::Out.Write(($ok|ConvertTo-Json -Compress))';
  const acl = await powershell(['-Command', aclScript], privatePath);
  assert.equal(acl.code, 0); assert.equal(JSON.parse(acl.stdout), true); scenarios++;

  const corrupt = Buffer.from(encrypted); corrupt[Math.floor(corrupt.length / 2)] ^= 1;
  await writeFile(privatePath, corrupt);
  fail(await run('Check')); assert.deepEqual(await readFile(privatePath), corrupt);
  await writeFile(privatePath, encrypted);
  pass(await run('Check'));
  fail(await run('Execute')); // SyntheticNonce is never a cloud execution path.
  assert.deepEqual(await readFile(privatePath), encrypted);
  await exactRemove(privatePath);

  for (const invalid of [
    {...ready, url: 'https://smooth-dory-323957.upstash.io'},
    {...ready, url: 'https://smooth-dory-fake.upstash.io'},
    {...ready, url: 'https://synthetic-wrapper-validation.upstash.io/private'},
    {...ready, token: 'invalid\ncredential'},
    {...ready, expiresAt: new Date(now - 1000).toISOString()},
    {...ready, expiresAt: new Date(now + 73 * 3600000).toISOString()},
    {...ready, unexpectedPrivateField: token},
  ]) { fail(await run('Save', invalid)); assert.equal(await existing(privatePath), undefined); }
  fail(await run('Save', '{"token":"' + token)); assert.equal(await existing(privatePath), undefined);
  fail(await run('Save', 'x'.repeat(16385))); assert.equal(await existing(privatePath), undefined);
  fail(await run('Save', ready, {env: {...process.env, NODE_ENV: 'production'}})); assert.equal(await existing(privatePath), undefined);
  pass(await run('Save', ready)); pass(await run('Check'));
  await exactRemove(privatePath);

  // This disposable checkout uses a reviewed local stub for Execute. It emits
  // private fields on both streams to prove sanitization and records only local
  // receipts; global fetch is disabled and no credential reaches args or env.
  await mkdir(join(scratch, 'scripts'), {recursive: true});
  await mkdir(join(scratch, '.vercel'));
  await writeFile(join(scratch, 'package.json'), '{"type":"module","private":true}\n');
  const scratchWrapper = join(scratch, 'scripts/invoke-redis-isolated-validation.ps1');
  await copyFile(wrapper, scratchWrapper);
  const childSource = `import {readFile,writeFile} from 'node:fs/promises';
globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN')};
let raw='';for await(const part of process.stdin)raw+=part;
const p=JSON.parse(raw);const executing=process.argv.includes('--execute');
if(process.argv.some(arg=>arg.includes(p.token)||arg.includes(p.databaseId))||Object.values(process.env).includes(p.token)||process.env.SYNTHETIC_WRAPPER_ENV_SECRET)throw Error('PRIVATE_TRANSPORT_LEAK');
if(!executing){console.log(JSON.stringify({status:'PASS',profileValid:true,phase:p.phase,expiresAt:p.expiresAt,basis:p.basis,networkUsed:false}));}
else{
await writeFile(new URL('../.vercel/local-child-receipt.json',import.meta.url),JSON.stringify({stdinPrivate:true,argsPrivate:false,envPrivate:false,networkUsed:false}));
process.stderr.write('SYNTHETIC_PRIVATE_CHILD_DIAGNOSTIC '+p.token+' '+p.databaseId);
const fail=await readFile(new URL('../.vercel/fail-mode',import.meta.url),'utf8').then(()=>true,()=>false);
console.log(JSON.stringify(fail?{status:'FAIL',stage:p.token,code:p.databaseId,networkUsed:false,isolatedSyntheticKeysRemoved:true}:{status:'PASS',syntheticAccounts:2,retentionDays:7,sharedMinuteCap:120,perAccountMinuteCap:60,persistedAfterProcessRestart:true,expiredReplayCannotRevive:true,atomicByteAccounting:true,privateAccountIsolation:true,recoveryWhenAdmissionsClosed:true,concurrentAtomicQuota:true,isolatedSyntheticKeysRemoved:true,redisExchanges:12,url:p.url,token:p.token,databaseId:p.databaseId,localLabel:p.localLabel}));
if(fail)process.exitCode=1;
}`;
  await writeFile(join(scratch, 'scripts/validate-workspace-redis-isolated.mjs'), childSource);
  const scratchPrivate = join(scratch, '.vercel/redis-validation-secrets.dpapi');
  const evidence = join(scratch, '.vercel/redis-validation-evidence.json');
  const scratchOptions = {wrapper: scratchWrapper, defaultPath: true, env: {...process.env, SYNTHETIC_WRAPPER_ENV_SECRET: token}};
  pass(await run('Save', ready, scratchOptions));
  await writeFile(evidence, '{"preexistingSyntheticEvidence":true}\n');
  fail(await run('Execute', undefined, scratchOptions));
  assert.ok(await existing(scratchPrivate), 'preflight failure preserves encrypted profile');
  assert.equal(await existing(join(scratch, '.vercel/local-child-receipt.json')), undefined);
  await rm(evidence);
  const execution = await run('Execute', undefined, scratchOptions); pass(execution);
  assert.equal(execution.report.encryptedProfileRemoved, true); assert.equal(await existing(scratchPrivate), undefined);
  const evidenceRaw = await readFile(evidence, 'utf8');
  assert.deepEqual(JSON.parse(evidenceRaw), execution.report);
  for (const secret of [token, pending.databaseId, ready.url, pending.localLabel]) assert.equal(evidenceRaw.includes(secret), false);
  assert.deepEqual(JSON.parse(await readFile(join(scratch, '.vercel/local-child-receipt.json'), 'utf8')), {stdinPrivate: true, argsPrivate: false, envPrivate: false, networkUsed: false});
  await rm(evidence);
  pass(await run('Save', ready, scratchOptions));
  await writeFile(join(scratch, '.vercel/fail-mode'), 'synthetic\n');
  const failedExecution = await run('Execute', undefined, scratchOptions); fail(failedExecution);
  assert.equal(failedExecution.report.encryptedProfileRemoved, true); assert.equal(await existing(scratchPrivate), undefined);
  assert.deepEqual(JSON.parse(await readFile(evidence, 'utf8')), failedExecution.report);

  console.log(JSON.stringify({status: 'PASS',scenarios, dpapi: 'CurrentUser synthetic profiles', ntfs: 'new files current user and SYSTEM only', pendingBinding: true, checkNetworkRequests: 0, simulatedExecuteNetworkRequests: 0, privateArgsOrEnvironment: false, childOutputSanitized: true, exactEncryptedCleanup: true, productionEndpointRejected: true, hostedRedisExecuted: false, realPayments: 0}));
} finally {
  await exactRemove(privatePath); await exactRemove(lockPath);
  const resolvedScratch = resolve(scratch);
  assert.equal(dirname(resolvedScratch), privateDirectory);
  assert.match(resolvedScratch.slice(privateDirectory.length + 1), /^redis-wrapper-fixture-[a-f0-9]{32}$/);
  const info = await existing(resolvedScratch);
  if (info) { assert.equal(info.isDirectory(), true); assert.equal(info.isSymbolicLink(), false); await rm(resolvedScratch, {recursive: true}); }
}
