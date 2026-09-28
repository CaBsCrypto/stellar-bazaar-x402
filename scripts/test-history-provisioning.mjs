import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, symlinkSync, unlinkSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { authenticateHistory } from '../lib/operation-history-auth.ts';
const root=mkdtempSync(join(tmpdir(),'bazaar-provision-test-'));
const insideRepo=mkdtempSync(new URL('../..provision-test-', import.meta.url));
try {
 const destination=join(root,'private');
 const command=['scripts/provision-history-account.mjs','--out',destination];
 const result=spawnSync(process.execPath,command,{encoding:'utf8'});
 assert.equal(result.status,0,'Provisioning must succeed without exposing output');
 const credentials=JSON.parse(readFileSync(join(destination,'credentials.json'),'utf8'));
 const account=JSON.parse(readFileSync(join(destination,'account.json'),'utf8'));
 assert(!result.stdout.includes(credentials.readToken)); assert(!result.stdout.includes(credentials.writeToken));
 assert(!result.stderr.includes(credentials.readToken)); assert(!result.stderr.includes(credentials.writeToken));
 const config=JSON.stringify([account]);
 assert.equal(authenticateHistory(`Bearer ${credentials.readToken}`,false,config).ownerId,authenticateHistory(`Bearer ${credentials.writeToken}`,true,config).ownerId);
 assert.notEqual(spawnSync(process.execPath,command,{encoding:'utf8'}).status,0);
 assert.deepEqual(JSON.parse(readFileSync(join(destination,'account.json'),'utf8')),account);
 assert.notEqual(spawnSync(process.execPath,['scripts/provision-history-account.mjs','--out','private-output-refused'],{encoding:'utf8'}).status,0);
 const disguisedInside=join(insideRepo,'private');
 const denied=spawnSync(process.execPath,['scripts/provision-history-account.mjs','--out',disguisedInside],{encoding:'utf8'});
 assert.notEqual(denied.status,0);
 assert.match(denied.stderr,/Output must be outside the repository/);
 assert.equal(existsSync(disguisedInside),false,'A repository directory beginning with two dots is still private-output forbidden');
 // Check the effective OS permissions, not merely the command's exit status.
 if(process.platform==='win32') {
  for(const target of [destination,join(destination,'credentials.json'),join(destination,'account.json')]) {
   const inspected=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    '$ErrorActionPreference="Stop"; $acl=if([System.IO.Directory]::Exists($env:BAZAAR_ACL_TEST_TARGET)){[System.IO.Directory]::GetAccessControl($env:BAZAAR_ACL_TEST_TARGET)}else{[System.IO.File]::GetAccessControl($env:BAZAAR_ACL_TEST_TARGET)}; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; [pscustomobject]@{sid=$sid; protected=$acl.AreAccessRulesProtected; allow=@($acl.Access | Where-Object AccessControlType -eq Allow | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value })} | ConvertTo-Json -Compress'],
    {encoding:'utf8',env:{...process.env,BAZAAR_ACL_TEST_TARGET:target}});
   assert.equal(inspected.status,0,'ACL inspection must succeed: '+inspected.stderr);
   const acl=JSON.parse(inspected.stdout);
   if(target===destination) assert.equal(acl.protected,true,'Private directory must disable inherited ACLs: '+inspected.stdout+' '+inspected.stderr);
   assert(acl.allow.length>0);
   assert(acl.allow.every(sid=>sid===acl.sid),'Only the provisioning operator may have an allow ACE');
  }
 } else {
  assert.equal(statSync(destination).mode & 0o777,0o700);
  for(const file of ['credentials.json','account.json']) assert.equal(statSync(join(destination,file)).mode & 0o777,0o600);
 }
 const junction=join(root,'repository-link');
 const repository=realpathSync(fileURLToPath(new URL('..',import.meta.url)));
 symlinkSync(repository,junction,process.platform==='win32'?'junction':'dir');
 try {
  const attempted=join(junction,'private-via-link');
  const deniedLink=spawnSync(process.execPath,['scripts/provision-history-account.mjs','--out',attempted],{encoding:'utf8'});
  assert.notEqual(deniedLink.status,0);
  assert.match(deniedLink.stderr,/Output must be outside the repository/);
  assert.equal(existsSync(attempted),false,'A TEMP junction into the repository must not permit secret output');
 } finally { unlinkSync(junction); }
 console.log('PASS offline provisioning, linked hashes, no secret stdout, overwrite/repository/junction refusal and effective private OS permissions. Synthetic files only.');
} finally {
 const repository=realpathSync(fileURLToPath(new URL('..',import.meta.url)));
 assert.equal(dirname(realpathSync(root)),realpathSync(tmpdir()));
 assert(basename(root).startsWith('bazaar-provision-test-'));
 assert.equal(dirname(realpathSync(insideRepo)),repository);
 assert(basename(insideRepo).startsWith('..provision-test-'));
 rmSync(resolve(root),{recursive:true,force:true});
 rmSync(resolve(insideRepo),{recursive:true,force:true});
}
