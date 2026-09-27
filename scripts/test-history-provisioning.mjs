import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
 console.log('PASS offline operator provisioning, linked hashes, no secret stdout, no overwrite and repository output refusal. Ephemeral files removed.');
} finally { rmSync(root,{recursive:true,force:true}); rmSync(insideRepo,{recursive:true,force:true}); }
