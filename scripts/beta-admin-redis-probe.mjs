import {readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {preparePrivateDirectory,verifyPrivateDirectory} from './history-private-files.mjs';
import {credentials} from './validate-provider-review-redis.mjs';
import {setReviewRedisForTests} from '../lib/provider-review-runtime.ts';
import {requireReviewSession,revokeReviewSession} from '../lib/provider-admin-session.ts';
import {limitReviewAdminRequest,REVIEW_LIMIT_SCRIPT} from '../lib/provider-review-limits.ts';
export const SET="return redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])";
export const DEL="return redis.call('DEL', KEYS[1])";
export function mapping(j){
 if(!/^[a-f0-9-]{36}$/.test(j.runId)||! /^[a-f0-9]{64}$/.test(j.token)||! /^[a-f0-9]{64}$/.test(j.secret))throw Error('Journal identity invalid');
 const base='bazaar-review:local-test',h=v=>createHmac('sha256',j.secret).update(v).digest('hex');
 return new Map([[`${base}:session:${createHash('sha256').update(j.token).digest('hex')}`,`${base}:admin-probe:${j.runId}:session`],[`${base}:rate:admin:ip:2:${h('ip:loopback')}`,`${base}:admin-probe:${j.runId}:rate-ip`],[`${base}:rate:admin:identity:${h(j.runId)}`,`${base}:admin-probe:${j.runId}:rate-identity`]]);
}
export function reserve(j,c){
 const keys=[...mapping(j).values()];let cost;
 if(['GET','TTL'].includes(c[0])&&c.length===2&&keys.includes(c[1]))cost=1;
 else if(c[0]==='EVAL'&&c[1]===SET&&c.length===6&&c[2]===1&&c[3]===keys[0]&&c[5]==='1800'){
  const s=JSON.parse(c[4]);if(s.email!=='synthetic-admin@example.invalid'||s.csrfToken!==j.csrf||!Number.isFinite(s.expiresAt)||Object.keys(s).sort().join(',')!=='csrfToken,email,expiresAt')throw Error('Seed rejected');cost=2;
 }else if(c[0]==='EVAL'&&c[1]===DEL&&c.length===4&&c[2]===1&&c[3]===keys[0])cost=2;
 else if(c[0]==='EVAL'&&c[1]===REVIEW_LIMIT_SCRIPT&&c.length===7&&c[2]===2&&c[3]===keys[1]&&c[4]===keys[2]&&c[5]==='[2,2]'&&c[6]==='[3600,3600]')cost=7;
 else throw Error('Command rejected');
 const bytes=Buffer.byteLength(JSON.stringify(c));if(![j.commands,j.requests,j.bytes].every(n=>Number.isInteger(n)&&n>=0)||j.commands+cost>200||j.requests+1>200||j.bytes+bytes>102400)throw Error('Budget exhausted');
 j.requests++;j.commands+=cost;j.bytes+=bytes;
}
async function main(){
 const [mode,directory,envFile]=process.argv.slice(2);if(!['prepare','run','check'].includes(mode)||!directory)throw Error('Usage prepare|run|check PRIVATE_DIR [ENV_FILE]');
 const dir=resolve(directory),path=resolve(dir,'journal.json');
 if(mode==='prepare'){preparePrivateDirectory(dir);const j={version:1,runId:randomUUID(),token:randomBytes(32).toString('hex'),csrf:randomBytes(32).toString('hex'),secret:randomBytes(32).toString('hex'),requests:0,commands:0,bytes:0,status:'prepared',checks:{}};j.keys=[...mapping(j).values()];writeFileSync(path,JSON.stringify(j,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({prepared:true,keys:j.keys}));return;}
 verifyPrivateDirectory(dir);const lockPath=resolve(dir,'runner.lock'),lock=openSync(lockPath,'wx',0o600);
 try{
 const j=JSON.parse(readFileSync(path,'utf8'));assert.equal(j.version,1);const map=mapping(j),keys=[...map.values()];assert.deepEqual(j.keys,keys);assert.match(j.csrf,/^[a-f0-9]{64}$/);
 if(mode==='run'&&j.status!=='prepared')throw Error('Never repeat run; inspect/check same journal');
 if(mode==='check'&&j.status!=='complete')throw Error('Execution incomplete; manual evidence reconciliation required');
 const save=()=>{const p=resolve(dir,`journal.${randomUUID()}.tmp`);writeFileSync(p,JSON.stringify(j,null,2),{flag:'wx',mode:0o600});renameSync(p,path);};
 const c=credentials(readFileSync(envFile,'utf8'));
 const command=async cmd=>{if(mode==='check'&&cmd[0]==='EVAL')throw Error('Read-only check');reserve(j,cmd);j.lastCommand={name:cmd[0],reserved:true};save();const response=await fetch(c.url,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${c.token}`,'content-type':'application/json'},body:JSON.stringify(cmd),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Redis request failed');const body=await response.json();if(body.error||!Object.hasOwn(body,'result'))throw Error('Redis result invalid');j.lastCommand.confirmed=true;save();return body.result;};
 const translate=k=>{if(!map.has(k))throw Error('Native key outside allowlist');return map.get(k);};
 setReviewRedisForTests({get:k=>command(['GET',translate(k)]),eval:(s,ks,args)=>command(['EVAL',s,ks.length,...ks.map(translate),...args])});
 process.env.BAZAAR_PROVIDER_REVIEW_BACKEND='redis';process.env.BAZAAR_REVIEW_PREFIX='bazaar-review:local-test';process.env.BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN='true';process.env.ADMIN_ALLOWED_EMAILS='synthetic-admin@example.invalid';process.env.NEXT_PUBLIC_APP_URL='https://probe.example.invalid';process.env.BAZAAR_REVIEW_RATE_SECRET=j.secret;delete process.env.VERCEL;
 const request=(csrf=j.csrf,origin='https://probe.example.invalid')=>new Request('https://probe.example.invalid/api/admin/provider-submissions',{headers:{cookie:`__Host-bazaar-review=${j.token}`,origin,'x-csrf-token':csrf}});
 if(mode==='run'){
  j.status='started';save();for(const key of keys)assert.equal(await command(['GET',key]),null,'Pre-existing key; stop');
  const seed={email:'synthetic-admin@example.invalid',csrfToken:j.csrf,expiresAt:Date.now()+1800000};assert.equal(await command(['EVAL',SET,1,keys[0],JSON.stringify(seed),'1800']),'OK');
  assert.equal((await requireReviewSession(request(),true)).email,seed.email);j.checks.nativeSession=true;
  await assert.rejects(requireReviewSession(request('0'.repeat(64)),true),/CSRF_DENIED/);await assert.rejects(requireReviewSession(request(j.csrf,'https://other.example.invalid'),true),/ORIGIN_DENIED/);j.checks.csrfOrigin=true;save();
  await revokeReviewSession(request());await assert.rejects(requireReviewSession(request()),/SESSION_REQUIRED/);j.checks.nativeRevocation=true;save();
  const r=new Request('http://localhost/api/admin/provider-submissions');assert.equal((await limitReviewAdminRequest(r,j.runId,2,3600)).ok,true);assert.equal((await limitReviewAdminRequest(r,j.runId,2,3600)).ok,true);assert.equal((await limitReviewAdminRequest(r,j.runId,2,3600)).status,429);j.checks.nativeLimit=true;
  for(const k of keys.slice(1)){assert.equal(Number(await command(['GET',k])),2);assert.ok(await command(['TTL',k])>0);}j.status='complete';save();
 }else{assert.equal(await command(['GET',keys[0]]),null);for(const k of keys.slice(1)){const value=await command(['GET',k]);assert.ok(value===null||Number(value)===2);}j.checks.separateProcessRevocation=true;save();}
 console.log(JSON.stringify({runId:j.runId,mode,requests:j.requests,conservativeCommands:j.commands,commandBytes:j.bytes,checks:j.checks,syntheticSessionSeed:true,emailOrOtpValidated:false,publicActivation:false}));
 }finally{setReviewRedisForTests(undefined);closeSync(lock);unlinkSync(lockPath);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error(JSON.stringify({stopped:true,instruction:'Inspect private journal; do not restart effects or allocate another run.'}));process.exitCode=1;});
