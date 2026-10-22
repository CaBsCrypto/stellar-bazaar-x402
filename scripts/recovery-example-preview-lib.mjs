import {readFile,writeFile,open,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isolatedActorTransform} from '../.vercel/readiness-guard-fix-isolated-actors.mjs';

export const EXAMPLE_PREVIEW = Object.freeze({
  team:'team_XjolcoWJ9V9yamVnCdpC7EMY',
  bazaarProject:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',
  providerProject:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K',
  scope:'cabscryptocontacto-6028s-projects',
  bazaarAlias:'stellar-bazaar-x402-example12.vercel.app',
  providerAlias:'ai-video-scriptwriter-example12.vercel.app',
  redisOrigin:'https://smooth-dory-323957.upstash.io',
  journal:'.vercel/recovery-example-preview-profile.dpapi',
  baselineBazaar:'dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY',
  baselineProvider:'dpl_59zNf8MCvktnzTgci3eppUriS2Un',
  originalJournal:'.vercel/on-demand-production-purchase-31c97193-be74-4b9d-b0a3-f3890b0a41e8.journal.dpapi',
  originalHash:'97efd58199da7499b40f0b0b889ddbd7844f91fab0fedb8351e9b9881c530cfb',
});
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
export const fingerprint=value=>sha(canonical(value));
export const fail=code=>{throw Error(code);};
export const zero={productionPublished:false,productionLimitsChanged:false,productionReservationsChanged:false,payments:0,signatures:0,settlements:0,cronActivated:false,secretValuesReturned:0};
export async function exclusive(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
export async function publicReceipt(path,value){await exclusive(path,{...value,...zero});}
export async function journalRead(){
  const info=await lstat(EXAMPLE_PREVIEW.journal).catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});
  if(!info)return undefined;
  if(!info.isFile()||info.isSymbolicLink()||info.size>524288)fail('EXAMPLE_PRIVATE_JOURNAL_BOUND');
  const line=(await readFile(EXAMPLE_PREVIEW.journal,'utf8')).trim().split('\n').at(-1);
  if(!/^[A-Za-z0-9+/]+=*$/.test(line??''))fail('EXAMPLE_PRIVATE_JOURNAL_INVALID');
  const bytes=await isolatedActorTransform('unseal',Buffer.from(line,'base64'));
  try{
    const value=JSON.parse(bytes.toString());if(value.purpose!=='bazaar-recovery-example-preview-v1'||!/^pilot-[a-f0-9]{32}$/.test(value.family))fail('EXAMPLE_PRIVATE_JOURNAL_BINDING');
    const hex=value.family.slice(6);
    if(value.workerPrefix!=='bazaar-seller:preview-'+hex||value.runtimePrefix!=='bazaar-seller:preview-'+sha('runtime:'+hex).slice(0,32)||value.user!=='bazaar_example_preview_'+hex||value.nativeUser!=='bazaar_example_accounts_preview_'+hex||value.card?.id!=='bazaar-recovery-example-text-v1'||value.card.url!=='https://'+EXAMPLE_PREVIEW.providerAlias||value.card.payment?.amount!=='0.01'||value.card.network!=='stellar:testnet'||value.cardHash!==fingerprint(value.card))fail('EXAMPLE_PRIVATE_JOURNAL_TARGET_BINDING');
    return value;
  }finally{bytes.fill(0);}
}
export async function journalWrite(value,initial=false){
  if(value.purpose!=='bazaar-recovery-example-preview-v1')fail('EXAMPLE_PRIVATE_JOURNAL_BINDING');
  const plain=Buffer.from(JSON.stringify(value));let cipher;
  try{cipher=await isolatedActorTransform('seal',plain);}finally{plain.fill(0);}
  const file=await open(EXAMPLE_PREVIEW.journal,initial?'wx':'a',0o600);
  try{await file.writeFile(cipher.toString('base64')+'\n');await file.sync();}finally{cipher.fill(0);await file.close();}
}
export async function originalJournalUnchanged(){if(sha(await readFile(EXAMPLE_PREVIEW.originalJournal))!==EXAMPLE_PREVIEW.originalHash)fail('ORIGINAL_PAYMENT_JOURNAL_CHANGED');return true;}
export async function privateInput(){let n=0,parts=[];for await(const b of process.stdin){n+=b.length;if(n>65536)fail('EXAMPLE_PRIVATE_INPUT_BOUND');parts.push(b);}const raw=Buffer.concat(parts);try{return JSON.parse(raw.toString());}finally{raw.fill(0);parts.forEach(b=>b.fill(0));}}

/** CLI authentication stays local; private overrides only travel as child environment values. */
export async function vc(args,{environment={},body,timeoutMs=60000}={}){
  const env={NO_UPDATE_NOTIFIER:'1',VERCEL_CLI_USE_NATIVE_BINARY:'0',...environment};
  for(const name of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[name])env[name]=process.env[name];
  return await new Promise((done,reject)=>{
    const child=spawn(process.execPath,['C:/Users/MGC/AppData/Roaming/npm/node_modules/vercel/dist/vc.js',...args,'--scope',EXAMPLE_PREVIEW.scope],{windowsHide:true,stdio:['pipe','pipe','pipe'],env});
    const chunks=[];let n=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(Error('EXAMPLE_VERCEL_ACTION_UNCONFIRMED')):done(value);};
    const timer=setTimeout(()=>{child.kill();finish(true);},timeoutMs);
    child.stderr.resume();child.stdout.on('data',b=>{n+=b.length;if(n>2097152){child.kill();finish(true);}else chunks.push(b);});
    child.on('error',()=>finish(true));child.on('close',code=>{try{const raw=Buffer.concat(chunks).toString();if(code!==0)throw Error();const parsed=JSON.parse(raw);if(parsed.error)throw Error();finish(false,parsed);}catch{finish(true);}});
    child.stdin.end(body===undefined?'':JSON.stringify(body));
  });
}
export const api=(path,method='GET',body)=>vc(['api',path,'--raw','--method',method,...(body===undefined?[]:['--input','-'])],{body});
export function envReferences(value){const rows=value.envs??value.env;if(!Array.isArray(rows))fail('EXAMPLE_PROJECT_ENV_INVALID');return fingerprint(rows.map(r=>({id:r.id,key:r.key,type:r.type,target:r.target,updatedAt:r.updatedAt??null,valueHash:typeof r.value==='string'?sha(r.value):null})).sort((a,b)=>a.key.localeCompare(b.key)));}

/** All Redis commands are counted, bounded, and restricted to the new synthetic family. */
export function redisCommands(profile,{prefixes=[],adminUser,expectedDeniedKey,maximum=2500,maximumCommands=15000,maximumBytes=100000000}={}){
  if(profile.url!==EXAMPLE_PREVIEW.redisOrigin||typeof profile.token!=='string')fail('EXAMPLE_REDIS_PROFILE_REQUIRED');
  const fetcher=globalThis.fetch;
  let requests=0,bytes=0,evals=0,conservativeCommands=0;
  return {snapshot:()=>({requests,bytes,evals,conservativeCommands,commandCounting:'256 per EVAL for bounded new synthetic native stores; not upstream billing',byteCounting:'UTF-8 request and response bodies, excluding transport headers'}),async command(values){
    if(!Array.isArray(values)||++requests>maximum)fail('EXAMPLE_REDIS_REQUEST_BOUND');
    const name=String(values[0]).toUpperCase();
    conservativeCommands+=name==='EVAL'?256:1;if(conservativeCommands>maximumCommands)fail('EXAMPLE_REDIS_COMMAND_BOUND');
    if(name==='ACL'){if(!adminUser||!['GETUSER','GENTOKEN','SETUSER'].includes(values[1])||values[2]!==adminUser)fail('EXAMPLE_ACL_TARGET');}
    else{
      const keys=name==='EVAL'?values.slice(3,3+values[2]):[values[1]];
      const denialProbe=name==='GET'&&values.length===2&&typeof expectedDeniedKey==='string'&&values[1]===expectedDeniedKey;
      if(!['GET','SET','DEL','EXISTS','EVAL','PTTL','TTL','SMEMBERS','SADD','SREM'].includes(name)||!keys.length||!denialProbe&&keys.some(k=>typeof k!=='string'||!prefixes.some(p=>k.startsWith(p+':'))))fail('EXAMPLE_REDIS_KEY_BOUNDARY');
      if(name==='EVAL')evals++;
    }
    const encoded=JSON.stringify(values);bytes+=Buffer.byteLength(encoded);if(bytes>maximumBytes)fail('EXAMPLE_REDIS_BYTE_BOUND');
    const response=await fetcher(profile.url,{method:'POST',headers:{authorization:'Bearer '+profile.token,'content-type':'application/json'},body:encoded,redirect:'error',signal:AbortSignal.timeout(10000)});
    const reader=response.body?.getReader();if(!reader)fail('EXAMPLE_REDIS_RESPONSE_REQUIRED');let responseBytes=0;const parts=[];
    try{for(;;){const next=await reader.read();if(next.done)break;responseBytes+=next.value.byteLength;bytes+=next.value.byteLength;if(responseBytes>2097152||bytes>maximumBytes){await reader.cancel();fail('EXAMPLE_REDIS_BYTE_BOUND');}parts.push(next.value);}}finally{reader.releaseLock();}
    const text=Buffer.concat(parts).toString('utf8');
    const value=JSON.parse(text);
    if(name==='GET'&&values[1]===expectedDeniedKey){if(typeof value.error==='string'&&/NOPERM|permission|access.*key/i.test(value.error))return {denied:true};fail('EXAMPLE_ACL_ISOLATION_UNCONFIRMED');}
    if(!response.ok||value.error)fail('EXAMPLE_REDIS_ACTION_UNCONFIRMED');return value.result;
  }};
}
