import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';

const names=/^[a-z][a-z0-9._-]{0,95}$/;
const operation=/^seller\.([0-9a-f-]{36})$/;
const maxBytes=32768;
export const SELLER_STORAGE_BUDGET=Object.freeze({maximumBytes:10_000_000,leaseBufferBytes:1_000_000,pendingHeadroomBytes:200_000,ledgerMaximumBytes:1_000_000});
const keyHash=value=>createHash('sha256').update(value).digest('hex');
const storageKey=(prefix,bindingHash)=>prefix+':'+bindingHash+':storage:v1';
const storageProjection=`
local function storage_project(raw,binding,now)
 if not raw then return nil,-3 end
 if string.len(raw)>1000000 then return nil,-3 end
 local valid,ledger=pcall(cjson.decode,raw)
 if not valid or type(ledger)~='table' or ledger.version~=1 or ledger.binding~=binding or ledger.initialized~=true or type(ledger.entries)~='table' then return nil,-3 end
 local total=1000000
 for id,entry in pairs(ledger.entries) do
  if type(id)~='string' or string.len(id)~=64 or type(entry)~='table' or type(entry.bytes)~='number' or entry.bytes<0 or entry.bytes%1~=0 or type(entry.expiresAt)~='number' or entry.expiresAt<0 or entry.expiresAt%1~=0 then return nil,-3 end
  if entry.expiresAt>0 and entry.expiresAt<=now then ledger.entries[id]=nil else total=total+entry.bytes end
 end
 return ledger,total
end
`;
export const SELLER_STORAGE_READ_LUA=`-- seller-storage-read-v1
${storageProjection}
local clock=redis.call('TIME');local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
local ledger,total=storage_project(redis.call('GET',KEYS[1]),ARGV[1],now)
if not ledger then return {-3,0} end
local encoded=cjson.encode(ledger);return {1,10000000-total-string.len(encoded)}
`;
const missing=()=>Object.assign(Error('WORKER_RECORD_ABSENT'),{code:'ENOENT'});
const safeInteger=value=>Number.isSafeInteger(value)&&value>=0;
const checkLeases=[
 "for i=1,#KEYS do",
 " if redis.call('GET',KEYS[i]) ~= ARGV[i] then return 0 end",
 "end",
 "return 1"
].join('\n');
function budgetWriteScript(writeRecord){return writeRecord.replace("local expiry=tonumber(ARGV[at+4])",`local expiry=tonumber(ARGV[at+4])
local budgetClock=redis.call('TIME');local budgetNow=tonumber(budgetClock[1])*1000+math.floor(tonumber(budgetClock[2])/1000)
local budget,total=storage_project(redis.call('GET',KEYS[locks+3]),ARGV[at+5],budgetNow)
if not budget then return -3 end
local dataId=ARGV[at+6];local guardId=ARGV[at+7]
local old=budget.entries[dataId]
local expectedBytes=prior and string.len(prior)+string.len(dataKey) or 0
if old then if old.bytes~=expectedBytes then return -3 end;total=total-old.bytes elseif expectedBytes~=0 then return -3 end
local dataBytes=string.len(ARGV[at+2])+string.len(dataKey)
budget.entries[dataId]={bytes=dataBytes,expiresAt=expiry};total=total+dataBytes
if ARGV[at+3]~='' then
 local oldGuard=budget.entries[guardId];local rawGuard=redis.call('GET',guardKey)
 local expectedGuard=rawGuard and string.len(rawGuard)+string.len(guardKey) or 0
 if oldGuard then if oldGuard.bytes~=expectedGuard then return -3 end;total=total-oldGuard.bytes elseif expectedGuard~=0 then return -3 end
 local guardBytes=string.len(ARGV[at+3])+string.len(guardKey)
 budget.entries[guardId]={bytes=guardBytes,expiresAt=0};total=total+guardBytes
end
local budgetNext=cjson.encode(budget)
if string.len(budgetNext)>1000000 or total+string.len(budgetNext)>10000000 then return -4 end`).replace('return 1',"redis.call('SET',KEYS[locks+3],budgetNext)\nreturn 1");}

/** Caller derives the complete journal names from native live and archived
 * orders plus the sole checkpoint. This helper never scans or deletes keys. */
export async function initializeSellerStorage(command,prefix,bindingHash,inventory){
 if(typeof command!=='function'||!/^bazaar-seller:(preview|production)-[a-f0-9]{32}$/.test(prefix??'')||!/^[a-f0-9]{64}$/.test(bindingHash??'')||!Array.isArray(inventory)||inventory.length>5000)throw Error('WORKER_STORAGE_INITIALIZATION_REQUIRED');
 const entries={},keys=[storageKey(prefix,bindingHash)],expected=[],seen=new Set();let bytes=SELLER_STORAGE_BUDGET.leaseBufferBytes;
 for(const row of inventory){
  if(!row||seen.has(row.name)||row.name!=='seller.hosted.tick'&&!operation.test(row.name??'')||row.dataRaw!==null&&typeof row.dataRaw!=='string'||row.guardRaw!==null&&typeof row.guardRaw!=='string')throw Error('WORKER_STORAGE_INITIALIZATION_REQUIRED');seen.add(row.name);
  let expiry=0;
  if(operation.test(row.name)&&row.dataRaw!==null){let guard;try{guard=JSON.parse(row.guardRaw);}catch{throw Error('WORKER_STORAGE_INITIALIZATION_REQUIRED');}expiry=Date.parse(guard.contentExpiresAt);if(guard.operationId!==row.name.slice(7)||!safeInteger(expiry))throw Error('WORKER_STORAGE_INITIALIZATION_REQUIRED');}
  for(const [kind,raw]of [['data',row.dataRaw],['guard',row.guardRaw]]){
   const key=prefix+':'+bindingHash+':'+kind+':'+row.name;keys.push(key);expected.push(raw===null?'missing':'present:'+raw);
   if(raw!==null){const size=Buffer.byteLength(key)+Buffer.byteLength(raw);if(size>maxBytes*2+512)throw Error('WORKER_STORAGE_INITIALIZATION_REQUIRED');entries[keyHash(key)]={bytes:size,expiresAt:kind==='data'?expiry:0};bytes+=size;}
  }
 }
 const raw=JSON.stringify({version:1,binding:bindingHash,initialized:true,entries});
 if(Buffer.byteLength(raw)>SELLER_STORAGE_BUDGET.ledgerMaximumBytes||bytes+Buffer.byteLength(raw)>SELLER_STORAGE_BUDGET.maximumBytes)throw Error('WORKER_STORAGE_CAPACITY');
 const script=`-- seller-storage-initialize-v1
if redis.call('GET',KEYS[1]) then return 0 end
for i=2,#KEYS do local current=redis.call('GET',KEYS[i]);local expected=ARGV[i];if expected=='missing' then if current then return 0 end else if not current or current~=string.sub(expected,9) then return 0 end end end
redis.call('SET',KEYS[1],ARGV[1]);return 1`;
 if(await command(['EVAL',script,keys.length,...keys,raw,...expected])!==1)throw Error('WORKER_STORAGE_INITIALIZATION_UNCONFIRMED');
 return {initialized:true,inventoryRecords:inventory.length,maximumBytes:SELLER_STORAGE_BUDGET.maximumBytes};
}
const releaseLease=[
 "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end",
 "return 0"
].join('\n');
const writeRecord=[
 "local locks=tonumber(ARGV[1])",
 "for i=1,locks do",
 " if redis.call('GET',KEYS[i]) ~= ARGV[i+1] then return -1 end",
 "end",
 "local dataKey=KEYS[locks+1]",
 "local guardKey=KEYS[locks+2]",
 "local prior=redis.call('GET',dataKey)",
 "local at=locks+2",
 "if ARGV[at] == 'missing' then",
 " if prior or redis.call('EXISTS',guardKey) == 1 then return 0 end",
 "elseif prior ~= ARGV[at+1] then return 0 end",
 "local expiry=tonumber(ARGV[at+4])",
 "if expiry > 0 then",
 " local clock=redis.call('TIME')",
 " local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)",
 " if expiry <= now then return -2 end",
 " redis.call('SET',dataKey,ARGV[at+2],'PXAT',expiry)",
 "else",
 " redis.call('SET',dataKey,ARGV[at+2])",
 "end",
 "if ARGV[at+3] ~= '' then redis.call('SET',guardKey,ARGV[at+3]) end",
 "return 1"
].join('\n');
export const SELLER_STORAGE_WRITE_LUA='-- seller-storage-write-v1\n'+storageProjection+'\n'+budgetWriteScript(writeRecord);

/** Private, fixed-endpoint REST transport. Never logs credentials or Redis errors. */
export function createWorkerRedisCommands({url,token,fetcher=fetch,signal}){
 let endpoint;
 try{const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.upstash.io')||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)throw Error();endpoint=parsed.origin;}catch{throw Error('WORKER_REDIS_CONFIGURATION_REQUIRED');}
 if(typeof token!=='string'||token.length<16||token.length>4096||/[\r\n]/.test(token)||typeof fetcher!=='function')throw Error('WORKER_REDIS_CONFIGURATION_REQUIRED');
 return async command=>{
  if(!Array.isArray(command)||!command.length)throw Error('WORKER_REDIS_COMMAND_REQUIRED');
  try{
   const response=await fetcher(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(command),redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(5000),...(signal?[signal]:[])])});
   if(!response.ok||response.redirected)throw Error();
   const raw=await response.text();if(Buffer.byteLength(raw)>131072)throw Error();
   const packet=JSON.parse(raw);if(packet.error||!Object.hasOwn(packet,'result'))throw Error();
   return packet.result;
  }catch{throw Error('WORKER_STORAGE_UNAVAILABLE');}
 };
}

/** Durable encrypted checkpoints. Payload expiry is fixed; minimal execution
 * guards have no TTL, so lost or expired content never authorizes another run.
 * CAS also checks the held lease tokens. No temporary filesystem fallback.
 */
export function createSellerRedisSecretStore({command,prefix,key,bindingHash,now=Date.now,leaseMs=90000,storageBudget=false}){
 if(typeof command!=='function'||!/^bazaar-seller:(preview|production)-[a-f0-9]{32}$/.test(prefix??'')||!/^[A-Za-z0-9_-]{43}$/.test(key??'')||!/^[a-f0-9]{64}$/.test(bindingHash??'')||typeof now!=='function'||!Number.isInteger(leaseMs)||leaseMs<60000||leaseMs>120000||typeof storageBudget!=='boolean')throw Error('WORKER_STORE_CONFIGURATION_REQUIRED');
 const secret=Buffer.from(key,'base64url');if(secret.length!==32||secret.toString('base64url')!==key)throw Error('WORKER_STORE_CONFIGURATION_REQUIRED');
 const leases=new Map(),cache=new Map();let disposed=false;
 const live=()=>{if(disposed)throw Error('WORKER_STORE_DISPOSED');};
 const nameValid=name=>{live();if(!names.test(name??''))throw Error('WORKER_RECORD_NAME_REQUIRED');};
 const dataKey=name=>prefix+':'+bindingHash+':data:'+name;
 const guardKey=name=>prefix+':'+bindingHash+':guard:'+name;
 const seal=(name,value)=>{
  const plain=Buffer.from(JSON.stringify(value));if(plain.length>maxBytes)throw Error('WORKER_RECORD_TOO_LARGE');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);cipher.setAAD(Buffer.from(dataKey(name)));
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);plain.fill(0);
  return JSON.stringify({v:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:encrypted.toString('base64url')});
 };
 const unseal=(name,raw)=>{
  try{
   if(typeof raw!=='string'||Buffer.byteLength(raw)>maxBytes*2)throw Error();
   const record=JSON.parse(raw);if(record.v!==1||Object.keys(record).sort().join(',')!=='ciphertext,iv,tag,v')throw Error();
   const decipher=createDecipheriv('aes-256-gcm',secret,Buffer.from(record.iv,'base64url'));decipher.setAAD(Buffer.from(dataKey(name)));decipher.setAuthTag(Buffer.from(record.tag,'base64url'));
   const plain=Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64url')),decipher.final()]);try{return JSON.parse(plain.toString('utf8'));}finally{plain.fill(0);}
  }catch{throw Error('WORKER_RECORD_UNCONFIRMED');}
 };
 async function read(name){
  nameValid(name);const raw=await command(['GET',dataKey(name)]);
  if(raw===null){const guard=await command(['GET',guardKey(name)]);if(guard!==null)throw Error('WORKER_CONTENT_EXPIRED_REQUIRES_REVIEW');cache.set(name,{raw:null,value:undefined});return undefined;}
  const value=unseal(name,raw);cache.set(name,{raw,value:structuredClone(value)});return value;
 }
 async function write(name,value,{createOnly=false}={}){
  nameValid(name);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('WORKER_RECORD_REQUIRED');
  if(storageBudget&&name!=='seller.hosted.tick'&&!operation.test(name))throw Error('WORKER_RECORD_NAME_REQUIRED');
  if(!leases.size)throw Error('WORKER_LOCK_REQUIRED');
  const ownOperation=operation.exec(name);
  if(ownOperation&&!leases.has(name))throw Error('WORKER_ORDER_LOCK_REQUIRED');
  if(!cache.has(name))await read(name);const prior=cache.get(name);
  if(createOnly&&prior.raw!==null)throw Error('WORKER_RECORD_ALREADY_EXISTS');
  let expiry=0,guard='';
  if(ownOperation){
   expiry=Date.parse(value.contentExpiresAt);
   if(!safeInteger(expiry)||expiry<=now()||value.operationId!==ownOperation[1]||!/^[0-9a-f-]{36}$/.test(value.attemptId??'')||!/^[a-f0-9]{64}$/.test(value.cardHash??'')||typeof value.phase!=='string')throw Error('WORKER_CONTENT_EXPIRY_REQUIRED');
   if(prior.value&&(prior.value.contentExpiresAt!==value.contentExpiresAt||prior.value.attemptId!==value.attemptId||prior.value.cardHash!==value.cardHash))throw Error('WORKER_RECORD_BINDING_CHANGED');
   guard=JSON.stringify({version:1,operationId:value.operationId,attemptId:value.attemptId,cardHash:value.cardHash,phase:value.phase,contentExpiresAt:value.contentExpiresAt,...(value.textHash?{textHash:value.textHash}:{}),...(value.binding?.transactionHash?{transactionHash:value.binding.transactionHash}:{})});
  }
  const encrypted=seal(name,value),held=[...leases.values()];
  const result=await command(['EVAL',storageBudget?SELLER_STORAGE_WRITE_LUA:writeRecord,held.length+(storageBudget?3:2),...held.map(v=>v.key),dataKey(name),guardKey(name),...(storageBudget?[storageKey(prefix,bindingHash)]:[]),held.length,...held.map(v=>v.token),prior.raw===null?'missing':'present',prior.raw??'',encrypted,guard,expiry,...(storageBudget?[bindingHash,keyHash(dataKey(name)),keyHash(guardKey(name))]:[])]);
  if(result!==1)throw Error(result===-1?'WORKER_LEASE_LOST':result===-2?'WORKER_CONTENT_EXPIRED_REQUIRES_REVIEW':result===-3?'WORKER_STORAGE_UNINITIALIZED':result===-4?'WORKER_STORAGE_CAPACITY':'WORKER_CAS_UNCONFIRMED');
  cache.set(name,{raw:encrypted,value:structuredClone(value)});
 }
 return {
  read,write,
  async capacityHeadroom(){
   live();if(!storageBudget)return {admissionReady:true,availableBytes:null,storageBudget:false};
   const result=await command(['EVAL',SELLER_STORAGE_READ_LUA,1,storageKey(prefix,bindingHash),bindingHash]);
   if(!Array.isArray(result)||result.length!==2||result[0]!==1||!Number.isSafeInteger(result[1]))throw Error('WORKER_STORAGE_UNINITIALIZED');
   return {admissionReady:result[1]>=SELLER_STORAGE_BUDGET.pendingHeadroomBytes,availableBytes:result[1],storageBudget:true};
  },
  journal(name){nameValid(name);return {async read(){const value=await read(name);if(value===undefined)throw missing();return value;},initialize:value=>write(name,value,{createOnly:true}),append:value=>write(name,value)};},
  async acquireLock(name){
   nameValid(name);if(leases.has(name))throw Error('WORKER_LOCK_BUSY');
   const lease={key:prefix+':'+bindingHash+':lock:'+name,token:randomUUID()};
   if(await command(['SET',lease.key,lease.token,'NX','PX',leaseMs])!=='OK')throw Error('WORKER_LOCK_BUSY');
   leases.set(name,lease);let released=false;
   return async()=>{if(released)return;released=true;leases.delete(name);if(await command(['EVAL',releaseLease,1,lease.key,lease.token])!==1)throw Error('WORKER_LEASE_RELEASE_UNCONFIRMED');};
  },
  async assertLocks(){live();const held=[...leases.values()];if(!held.length||await command(['EVAL',checkLeases,held.length,...held.map(v=>v.key),...held.map(v=>v.token)])!==1)throw Error('WORKER_LEASE_LOST');},
  dispose(){disposed=true;secret.fill(0);cache.clear();}
 };
}
