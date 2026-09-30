import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { preparePrivateDirectory, verifyPrivateDirectory } from './history-private-files.mjs';
import { createRedisReviewStore } from '../lib/provider-review-redis.ts';
import { setReviewRedisForTests } from '../lib/provider-review-runtime.ts';
import { submitProviderDraft, getSubmissionStatus } from '../lib/provider-self-listing.ts';

export const KEY='bazaar-review:local-test:state';
export const HOST='key-cowbird-107463.upstash.io';
export function ownedEnvelope(raw,submissionId){const e=JSON.parse(raw);if(e?.version!==1||e.state?.version!==1||e.state.records?.length!==1||e.state.records[0]?.submission?.submissionId!==submissionId)throw Error('Unowned state rejected');}
export function canResumePreflight(j){return j.version===1&&j.status==='started'&&j.requests===1&&j.commands===1&&j.bytes===Buffer.byteLength(JSON.stringify(['GET',KEY]))&&j.checks!==null&&typeof j.checks==='object'&&!Array.isArray(j.checks)&&Object.keys(j.checks).length===0&&j.lastCommand?.name==='GET'&&j.lastCommand.reserved===true&&!Object.hasOwn(j.lastCommand,'confirmed')&&Object.keys(j.lastCommand).sort().join(',')==='name,reserved';}
const CAS=`local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then
  if old then return 0 end
else
  if not old or old~=ARGV[2] then return 0 end
end
redis.call('SET',KEYS[1],ARGV[3])
return 1`;
export function credentials(text) {
 const env={}; for(const line of text.split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');}
 const url=env.BAZAAR_REVIEW_REDIS_REST_URL||env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL;
 const token=env.BAZAAR_REVIEW_REDIS_REST_TOKEN||env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;
 const parsed=new URL(url);if(parsed.origin!==`https://${HOST}`||!['','/'].includes(parsed.pathname)||parsed.search||parsed.hash||parsed.username||parsed.password||!token)throw Error('Redis target rejected');
 return {url:parsed.origin,token};
}
export function reserve(j,command){
 const name=command[0];let cost=1;
 if(name==='GET'||name==='TTL'){if(command.length!==2||command[1]!==KEY)throw Error('Key rejected');}
 else if(name==='EVAL'){
  if(command[2]!==1||command[3]!==KEY||command.length!==7||!['missing','present'].includes(command[4]))throw Error('CAS shape rejected');
  if(typeof command[1]!=='string'||command[1].trim().replace(/\r\n/g,'\n')!==CAS)throw Error('Script rejected');cost=3;
 }else throw Error('Command rejected');
 const bytes=Buffer.byteLength(JSON.stringify(command));
 if(j.requests+1>200||j.commands+cost>200||j.bytes+bytes>100*1024)throw Error('Budget exhausted');
 j.requests++;j.commands+=cost;j.bytes+=bytes;
}
const card={version:'bazaar.service-card/v0',id:'isolated-redis-review-proof',name:'Synthetic Redis review proof',description:'Synthetic storage validation only; never activate',kind:'http',url:'https://api.provider.example.com',routeTemplate:'/v1/quote/{pair}',input:[{name:'pair',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'},provider:{name:'Synthetic fixture'},tags:['synthetic']};
async function main(){
 const [mode,directory,envFile]=process.argv.slice(2);if(!['prepare','run','resume-preflight','check'].includes(mode)||!directory)throw Error('Usage: prepare|run|resume-preflight|check PRIVATE_DIRECTORY [ENV_FILE]');
 const dir=resolve(directory),path=resolve(dir,'journal.json');
 if(mode==='prepare'){preparePrivateDirectory(dir);writeFileSync(path,JSON.stringify({version:1,runId:randomUUID(),submissionId:randomUUID(),submissionToken:randomBytes(32).toString('hex'),requests:0,commands:0,bytes:0,status:'prepared',checks:{}},null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({prepared:true}));return;}
 verifyPrivateDirectory(dir);const lockPath=resolve(dir,'runner.lock');const lock=openSync(lockPath,'wx',0o600);
 try{
 const j=JSON.parse(readFileSync(path,'utf8'));if(j.version!==1||!Number.isInteger(j.requests)||!Number.isInteger(j.commands)||!Number.isInteger(j.bytes)||Math.min(j.requests,j.commands,j.bytes)<0)throw Error('Journal invalid');
 const save=()=>{const temporary=resolve(dir,`journal.${randomUUID()}.tmp`);writeFileSync(temporary,JSON.stringify(j,null,2),{flag:'wx',mode:0o600});renameSync(temporary,path);};
 if(mode==='check'&&['prepared','blocked-existing-state'].includes(j.status))throw Error('No owned execution to recover');
 const owned=raw=>ownedEnvelope(raw,j.submissionId);
 const c=credentials(readFileSync(envFile,'utf8'));
 const command=async cmd=>{if(mode==='check'&&cmd[0]==='EVAL')throw Error('Check is read-only');if(cmd[0]==='EVAL')owned(cmd[6]);reserve(j,cmd);j.lastCommand={name:cmd[0],reserved:true};save();const response=await fetch(c.url,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${c.token}`,'content-type':'application/json'},body:JSON.stringify(cmd),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Redis request failed');const body=await response.json();if(body.error||!Object.hasOwn(body,'result'))throw Error('Redis response rejected');j.lastCommand.confirmed=true;save();if(cmd[0]==='GET'&&body.result!==null){try{owned(body.result);}catch{j.status='blocked-existing-state';save();throw Error('Unowned state rejected');}}return body.result;};
 let loseAck=false;const redis={get:k=>command(['GET',k]),eval:async(s,k,a)=>{const r=await command(['EVAL',s,k.length,...k,...a]);if(loseAck){loseAck=false;throw Error('SYNTHETIC_LOST_ACK');}return r;}};
 process.env.BAZAAR_PROVIDER_REVIEW_BACKEND='redis';process.env.BAZAAR_REVIEW_PREFIX='bazaar-review:local-test';process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE='true';setReviewRedisForTests(redis);
 if(mode==='run'||mode==='resume-preflight'){
  if(mode==='resume-preflight'?!canResumePreflight(j):j.status!=='prepared')throw Error('Execution already started; use check only');
  j.status='started';save();if(await redis.get(KEY)!==null){j.status='blocked-existing-state';save();throw Error('Existing state: no writes permitted');}
  const result=await submitProviderDraft(card,{method:'dns-txt',domain:'api.provider.example.com'},j);assert.equal(result.ok,true);j.checks.nativeSubmission=true;save();
  const store=createRedisReviewStore(redis,'bazaar-review:local-test',s=>{assert.equal(s.version,1);assert.equal(s.records.length,1);assert.equal(s.records[0].submission.submissionId,j.submissionId);});
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  const stale=store.transact(async s=>{enter();await gate;s.records[0].submission.updatedAt=new Date(Date.now()+1).toISOString();});
  const staleOutcome=stale.then(()=>false,()=>true);await entered;await store.transact(s=>{s.records[0].submission.updatedAt=new Date(Date.now()+2).toISOString();});release();assert.equal(await staleOutcome,true);j.checks.staleCASRejected=true;save();
  loseAck=true;await assert.rejects(store.transact(s=>{s.records[0].submission.updatedAt=new Date(Date.now()+3).toISOString();}),/SYNTHETIC_LOST_ACK/);j.checks.syntheticLostAck=true;j.status='recovery-required';save();
 }
 const recovered=await getSubmissionStatus(j.submissionId,j.submissionToken);assert.equal(recovered.ok,true);assert.equal(recovered.value.serviceCardId,card.id);assert.equal(recovered.value.publiclyActive,false);assert.equal(await command(['TTL',KEY]),-1);
 j.checks[mode==='check'?'separateInvocationRecovery':'sameInvocationRecovery']=true;j.checks.noStateTTL=true;j.status='reconciled';save();
 console.log(JSON.stringify({ok:true,mode,runId:j.runId,requests:j.requests,conservativeCommands:j.commands,cumulativeCommandBytes:j.bytes,checks:j.checks,externalActivation:false}));
 }finally{setReviewRedisForTests(undefined);closeSync(lock);unlinkSync(lockPath);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{const known=new Set(['EPERM','EACCES','ENOTFOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT']);const code=error?.cause?.code||error?.code;console.error(JSON.stringify({stopped:true,code:known.has(code)?code:error?.name==='TimeoutError'?'TIMEOUT':error?.name==='AssertionError'?'ASSERTION_FAILED':'VALIDATION_FAILED',instruction:'Inspect private journal; do not rerun effects.'}));process.exitCode=1;});
