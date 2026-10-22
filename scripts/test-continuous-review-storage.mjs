import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRedisReviewStore} from '../lib/provider-review-redis.ts';
import {initializeContinuousStorageLedger,continuousStorageKey} from '../lib/continuous-free-storage.ts';
const prior=Object.fromEntries(['BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_WORKSPACE_PREFIX'].map(k=>[k,process.env[k]]));
delete process.env.BAZAAR_FREE_DEMO_MODE;delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;delete process.env.BAZAAR_WORKSPACE_PREFIX;
const reviewPrefix='bazaar-review:pilot-'+'7b'.repeat(16),workspacePrefix=reviewPrefix.replace('bazaar-review','bazaar-workspace'),key=reviewPrefix+':state',ledgerKey=continuousStorageKey(workspacePrefix),hash=value=>createHash('sha256').update(value).digest('hex');
const data=new Map();let writes=0,loseAck=false,conflict=false,checks=0;
const redis={async get(k){return data.get(k)??null;},async eval(script,keys,args){
 if(script.includes('-- continuous-free-storage-initialize-v1')){if(data.has(keys[0]))return 0;for(let i=1;i<keys.length;i++)if(args[i]==='missing'?data.has(keys[i]):data.get(keys[i])!==args[i].slice(8))return 0;data.set(keys[0],args[0]);writes++;return 1;}
 if(conflict){conflict=false;return 0;}
 const raw=data.get(keys[0]);if(args[0]==='missing'?raw!==undefined:raw!==args[1])return 0;
 if(keys.length===2){
  const ledgerRaw=data.get(keys[1]);if(!ledgerRaw)return -21;const ledger=JSON.parse(ledgerRaw),patch=JSON.parse(args[4]);
  assert.ok(script.indexOf('storageOld')>script.indexOf('if ARGV[1]'));assert.ok(script.indexOf('storageOld')<script.indexOf("redis.call('SET'"));
  for(const row of patch){const old=ledger.entries[row.key];if(old?old.bytes!==row.expected:row.expected!==0)return -20;const reserved=row.reserved??old?.reserved??0;if(!row.bytes&&!reserved)delete ledger.entries[row.key];else ledger.entries[row.key]={bytes:row.bytes,reserved};}
  const next=JSON.stringify(ledger);if(Object.values(ledger.entries).reduce((n,e)=>n+e.bytes+e.reserved,0)+Buffer.byteLength(next)>200000000)return -24;
  data.set(keys[1],next);writes++;
 }
 data.set(keys[0],args[2]);writes++;if(loseAck){loseAck=false;throw Error('SYNTHETIC_LOST_ACK');}return 1;
}};
const validate=state=>{assert.equal(state.version,1);assert.ok(Array.isArray(state.records));},fresh=()=>createRedisReviewStore(redis,reviewPrefix,validate);
try{
 await fresh().transact(s=>s.records.push({id:'before-continuous'}));
 await initializeContinuousStorageLedger(redis,workspacePrefix,[{key,expectedRaw:data.get(key),nextRaw:data.get(key)}]);process.env.BAZAAR_FREE_DEMO_MODE='continuous';
 await fresh().transact(s=>s.records.push({id:'continuous'}));assert.equal(JSON.parse(data.get(ledgerKey)).entries[hash(key)].bytes,Buffer.byteLength(data.get(key)));checks++;
 const before=data.get(key),beforeLedger=data.get(ledgerKey),beforeWrites=writes;conflict=true;await assert.rejects(fresh().transact(s=>s.records.push({id:'conflicted'})));assert.equal(writes,beforeWrites);assert.equal(data.get(key),before);assert.equal(data.get(ledgerKey),beforeLedger);checks++;
 loseAck=true;await assert.rejects(fresh().transact(s=>s.records.push({id:'lost-ack'})),/SYNTHETIC_LOST_ACK/);assert.equal((await fresh().transact(s=>s.records)).filter(v=>v.id==='lost-ack').length,1);checks++;
 const filled=JSON.parse(data.get(ledgerKey));filled.entries['f'.repeat(64)]={bytes:199999999,reserved:0};data.set(ledgerKey,JSON.stringify(filled));const beforeFull=data.get(key),fullWrites=writes;
 await assert.rejects(fresh().transact(s=>s.records.push({id:'full'})),{code:'FREE_DEMO_STORAGE_CAPACITY'});assert.equal(data.get(key),beforeFull);assert.equal(writes,fullWrites);checks++;
 data.delete(ledgerKey);await assert.rejects(fresh().transact(s=>s.records.push({id:'missing-ledger'})),{code:'FREE_DEMO_STORAGE_UNINITIALIZED'});assert.equal(data.get(key),beforeFull);checks++;
 console.log(JSON.stringify({status:'PASS_LOCAL_CONTINUOUS_REVIEW_STORAGE',checks,atomicNativeAndLedgerWrites:true,uncertainWriteRetries:0,quotaCheckedBeforeMutation:true,cloudWrites:0,externalRequests:0,payments:0}));
}finally{for(const[key,value]of Object.entries(prior))value===undefined?delete process.env[key]:process.env[key]=value;}
