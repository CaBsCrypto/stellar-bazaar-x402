import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {authenticateHistory} from '../lib/operation-history-auth.ts';
import {verifyPrivateDirectory} from './history-private-files.mjs';
const root=mkdtempSync(join(tmpdir(),'bazaar-identity-rotation-'));
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|COMSPEC|PATHEXT)$/i.test(k)));
const run=(script,args,ok=true)=>{const r=spawnSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url)),...args],{env,encoding:'utf8'});assert.equal(r.status===0,ok,'Command status unexpected');return r;};
const permissive=join(root,'permissive');mkdirSync(permissive,{mode:0o755});
if(process.platform==='win32') {
 const acl=spawnSync('icacls.exe',[permissive,'/grant','*S-1-1-0:(OI)(CI)R'],{env,encoding:'utf8'});
 assert.equal(acl.status,0,'Cannot construct isolated permissive ACL fixture');
} else chmodSync(permissive,0o755);
assert.throws(()=>verifyPrivateDirectory(permissive));assert.deepEqual(readdirSync(permissive),[]);
const load=d=>JSON.parse(readFileSync(join(d,'credentials.json'),'utf8'));
const config=d=>JSON.stringify([JSON.parse(readFileSync(join(d,'account.json'),'utf8'))]);
const initial=join(root,'initial');const created=run('provision-history-account.mjs',['--out',initial]);verifyPrivateDirectory(initial);
const original=load(initial);
for(const token of [original.readToken,original.writeToken]) assert(!(created.stdout+created.stderr).includes(token));
for(const role of ['read','write','both']) {
 const output=join(root,role);
 const result=run('rotate-history-account.mjs',['--account',join(initial,'account.json'),'--credentials',join(initial,'credentials.json'),'--role',role,'--out',output]);
 verifyPrivateDirectory(output);const next=load(output);assert.equal(next.ownerId,original.ownerId);
 for(const r of ['read','write']) {if(role==='both'||role===r){assert(next[`${r}Token`]!==original[`${r}Token`]);assert.throws(()=>authenticateHistory(`Bearer ${original[`${r}Token`]}`,false,config(output)));}else assert(next[`${r}Token`]===original[`${r}Token`]);assert.equal(authenticateHistory(`Bearer ${next[`${r}Token`]}`,r==='write',config(output)).ownerId,original.ownerId);assert(!(result.stdout+result.stderr).includes(next[`${r}Token`]));assert(!(result.stdout+result.stderr).includes(original[`${r}Token`]));}
 assert.throws(()=>authenticateHistory(`Bearer ${next.readToken}`,true,config(output)),{code:'FORBIDDEN'});
 run('rotate-history-account.mjs',['--account',join(initial,'account.json'),'--credentials',join(initial,'credentials.json'),'--role',role,'--out',output],false);
}
const corrupt=join(initial,'corrupt.json');writeFileSync(corrupt,JSON.stringify({...original,ownerId:'different'}),{flag:'wx',mode:0o600});
const rejected=join(root,'rejected');run('rotate-history-account.mjs',['--account',join(initial,'account.json'),'--credentials',corrupt,'--role','read','--out',rejected],false);assert(!existsSync(rejected));
assert.throws(()=>authenticateHistory(`Bearer ${original.readToken}`,false,'[]'));
console.log('PASS creation, verified private permissions, read/write/both rotation, unchanged owner and unaffected role, old credentials rejected, unknown association and overwrite denied. Synthetic offline only.');
