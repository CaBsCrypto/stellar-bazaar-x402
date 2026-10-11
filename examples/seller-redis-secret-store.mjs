import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';

const names=/^[a-z][a-z0-9._-]{0,95}$/;
const operation=/^seller\.([0-9a-f-]{36})$/;
const maxBytes=32768;
const missing=()=>Object.assign(Error('WORKER_RECORD_ABSENT'),{code:'ENOENT'});
const safeInteger=value=>Number.isSafeInteger(value)&&value>=0;
const checkLeases=[
 "for i=1,#KEYS do",
 " if redis.call('GET',KEYS[i]) ~= ARGV[i] then return 0 end",
 "end",
 "return 1"
].join('\n');
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
export function createSellerRedisSecretStore({command,prefix,key,bindingHash,now=Date.now,leaseMs=90000}){
 if(typeof command!=='function'||!/^bazaar-seller:(preview|production)-[a-f0-9]{32}$/.test(prefix??'')||!/^[A-Za-z0-9_-]{43}$/.test(key??'')||!/^[a-f0-9]{64}$/.test(bindingHash??'')||typeof now!=='function'||!Number.isInteger(leaseMs)||leaseMs<60000||leaseMs>120000)throw Error('WORKER_STORE_CONFIGURATION_REQUIRED');
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
  const result=await command(['EVAL',writeRecord,held.length+2,...held.map(v=>v.key),dataKey(name),guardKey(name),held.length,...held.map(v=>v.token),prior.raw===null?'missing':'present',prior.raw??'',encrypted,guard,expiry]);
  if(result!==1)throw Error(result===-1?'WORKER_LEASE_LOST':result===-2?'WORKER_CONTENT_EXPIRED_REQUIRES_REVIEW':'WORKER_CAS_UNCONFIRMED');
  cache.set(name,{raw:encrypted,value:structuredClone(value)});
 }
 return {
  read,write,
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
