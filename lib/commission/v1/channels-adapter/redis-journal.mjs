import {createHash} from 'node:crypto';
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const HASH=/^[a-f0-9]{64}$/;
const ROW_FIELDS=['authorizationHash','key','packetHash','policyHash','state','version'];
const phases=new Set(['dispatch-claimed','uncertain','submitted-unconfirmed','confirmed']);
const edge={ 'dispatch-claimed':['uncertain','submitted-unconfirmed'],'submitted-unconfirmed':['confirmed'] };
/** Same single-attempt GET/CAS pattern as native MarketX402Store, isolated per new-profile attempt.
 * Guard keys are only read. The only SET target is KEYS[1] in the split v1 namespace. No TTL/delete.
 */
export const SPLIT_JOURNAL_CAS=`local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
if now>=tonumber(ARGV[1]) then return -2 end
local guards=cjson.decode(ARGV[2])
for i=2,#KEYS do
 local old=redis.call('GET',KEYS[i]);local expected=guards[i-1]
 if expected==cjson.null then if old then return -2 end else if not old or old~=expected then return -2 end end
end
local old=redis.call('GET',KEYS[1])
if ARGV[4]=='missing' then if old then return 0 end else if not old or old~=ARGV[4] then return 0 end end
redis.call('SET',KEYS[1],ARGV[3]);return 1`;
function validateRecord(row,key){
 need(row&&typeof row==='object'&&row.version==='bazaar-split-exact-v1'&&row.key===key&&phases.has(row.state)&&[row.policyHash,row.packetHash,row.authorizationHash].every(v=>typeof v==='string'&&HASH.test(v)),'JOURNAL_RECORD_INVALID');
 const allowed=[...ROW_FIELDS,'transactionId','transactionHash','receipt'];need(Object.keys(row).every(k=>allowed.includes(k)),'JOURNAL_RECORD_INVALID');
 if(row.transactionHash!==undefined)need(typeof row.transactionHash==='string'&&HASH.test(row.transactionHash),'JOURNAL_RECORD_INVALID');
 if(row.transactionId!==undefined)need(typeof row.transactionId==='string'&&row.transactionId.length>0&&row.transactionId.length<=128,'JOURNAL_RECORD_INVALID');
 if(['submitted-unconfirmed','confirmed'].includes(row.state))need(row.transactionId&&row.transactionHash,'JOURNAL_RECORD_INVALID');
 if(row.state==='confirmed')need(row.receipt&&row.receipt.profile===row.version&&row.receipt.policyHash===row.policyHash&&row.receipt.transactionHash===row.transactionHash&&row.receipt.verifiedLedgerMeta===true&&row.receipt.status==='SUCCESS','JOURNAL_RECEIPT_REQUIRED');
 need(Buffer.byteLength(JSON.stringify(row))<=16384,'JOURNAL_RECORD_BOUND');
}
export function createRedisSplitJournal({enabled=false,redis,namespace,authorizeWrite,readRecord,nativeStoragePrefix}={}){
 function configured(key){
  need(enabled===true,'SPLIT_JOURNAL_DISABLED');
  need(redis&&typeof redis.get==='function'&&typeof redis.eval==='function'&&typeof authorizeWrite==='function'&&/^bazaar:split:v1:pilot:[a-f0-9]{32}$/.test(namespace),'SPLIT_JOURNAL_NOT_CONFIGURED');
  need(typeof key==='string'&&/^bazaar-split-exact-v1:G[A-Z2-7]{55}:[a-f0-9]{64}$/.test(key),'JOURNAL_KEY_INVALID');
  if(nativeStoragePrefix!==undefined)need(nativeStoragePrefix==='bazaar-market:pilot-'+namespace.slice('bazaar:split:v1:pilot:'.length)+':split:v1:journal:','JOURNAL_STORAGE_PREFIX_INVALID');return (nativeStoragePrefix??namespace+':journal:')+createHash('sha256').update(key).digest('hex');
 }
 async function guard(input){
  const g=await authorizeWrite(Object.freeze({...input}));
  need(g&&Array.isArray(g.keys)&&Array.isArray(g.values)&&g.keys.length===g.values.length&&(g.keys.length>0||typeof g.commit==='function')&&g.keys.length<=32&&g.keys.every(k=>typeof k==='string'&&k.length<=256)&&g.values.every(v=>v===null||typeof v==='string'&&Buffer.byteLength(v)<=16384)&&Number.isSafeInteger(g.expiresAtMs)&&g.expiresAtMs>0,'JOURNAL_ADMISSION_REQUIRED');
  return g;
 }
 async function cas(storageKey,expected,row,g){
  need(!g.keys.includes(storageKey),'JOURNAL_GUARD_COLLISION');
  const plan=Object.freeze({script:SPLIT_JOURNAL_CAS,keys:Object.freeze([storageKey,...g.keys]),args:Object.freeze([String(g.expiresAtMs),JSON.stringify(g.values),JSON.stringify(row),expected])});const result=typeof g.commit==='function'?await (await g.commit(plan)).execute():await redis.eval(plan.script,plan.keys,plan.args);
  need(result===0||result===1,'JOURNAL_WRITE_UNCONFIRMED');return result===1;
 }
 return Object.freeze({
  async read(key){const storageKey=configured(key),raw=typeof readRecord==='function'?await readRecord({key,action:'read'}):await redis.get(storageKey);if(raw===null||raw===undefined)return null;need(typeof raw==='string'&&Buffer.byteLength(raw)<=16384,'JOURNAL_READ_UNCONFIRMED');let row;try{row=JSON.parse(raw);}catch{throw Error('JOURNAL_READ_UNCONFIRMED');}validateRecord(row,key);return row;},
  async claim(key,row){const storageKey=configured(key);validateRecord(row,key);need(row.state==='dispatch-claimed'&&Object.keys(row).sort().join(',')===ROW_FIELDS.join(','),'JOURNAL_INITIAL_STATE_INVALID');const g=await guard({key,action:'claim'});return cas(storageKey,'missing',row,g);},
  async transition(key,expected,patch){
   const storageKey=configured(key);need(patch&&Object.keys(patch).every(k=>['state','transactionId','transactionHash','receipt'].includes(k))&&edge[expected]?.includes(patch.state),'JOURNAL_TRANSITION_INVALID');
   const g=await guard({key,action:'transition'}),raw=typeof readRecord==='function'?await readRecord({key,action:'transition'}):await redis.get(storageKey);need(typeof raw==='string'&&Buffer.byteLength(raw)<=16384,'JOURNAL_READ_UNCONFIRMED');
   let old;try{old=JSON.parse(raw);}catch{throw new Error('JOURNAL_READ_UNCONFIRMED');}validateRecord(old,key);if(old.state!==expected)return false;
   const row={...old,...structuredClone(patch)};validateRecord(row,key);return cas(storageKey,raw,row,g);
  },
 });
}
