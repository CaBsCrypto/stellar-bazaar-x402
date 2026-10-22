import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {productionSellerStorageInventory,originalSellerBinding} from '../.vercel/on-demand-production-v3-seller-storage.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),family='0cd860b8cfc35fc459b4838fa9092007',prefix='bazaar-seller:production-'+family,clock=Date.now();
const config={bazaarOrigin:'https://bazaar.browns.studio',ownerId:'ow_'+'a'.repeat(32),agentId:'agent_'+'b'.repeat(32),cardHash:'c'.repeat(64),allowedOrigins:['https://ai-video-scriptwriter.vercel.app'],agentAccess:'LOCAL_SYNTHETIC_AGENT_ONLY',providerAccess:'LOCAL_SYNTHETIC_PROVIDER_ONLY'},binding=originalSellerBinding(config);
let checks=0,realNetworkRequests=0;const oldFetch=globalThis.fetch;globalThis.fetch=()=>{realNetworkRequests++;throw Error('OFFLINE_ONLY');};
function fixture(){
 const raw=JSON.stringify({version:1,state:{version:1,orders:[],archived:[]}}),data=new Map(),storageKey=prefix+':'+binding+':storage:v1';let writes=0,lostAck=false,state=raw,reads=0,onRead;
 const primary={async get(key){assert.equal(key,'bazaar-market:pilot-'+family+':state');return state;}};
 const command=async values=>{
  if(values[0]==='GET'){reads++;if(onRead)onRead(values[1],reads,data);return data.get(values[1])??null;}
  assert.equal(values[0],'EVAL');const script=values[1],count=Number(values[2]),keys=values.slice(3,3+count),args=values.slice(3+count);
  if(script.startsWith('-- seller-storage-initialize-v1')){
   assert.equal(keys[0],storageKey);if(data.has(storageKey))return 0;for(let i=1;i<keys.length;i++){const old=data.get(keys[i])??null,expected=args[i];if(expected==='missing'?old!==null:old!==expected.slice(8))return 0;}data.set(storageKey,args[0]);writes++;if(lostAck){lostAck=false;throw Error('SYNTHETIC_LOST_ACK');}return 1;
  }
  throw Error('UNEXPECTED_SCOPE_COMMAND');
 };
 return {data,primary,command,storageKey,options:{primary,command,config,key:'unused synthetic fixture key',bindingHash:binding,now:()=>clock,headroom:async()=>({admissionReady:true})},get writes(){return writes;},loseAck(){lostAck=true;},setRead(fn){onRead=fn;},setState(value){state=value;}};
}
try{
 const f=fixture(),before=new Map(f.data),inventory=await productionSellerStorageInventory({...f.options,action:'inventory'});assert.equal(inventory.status,'PASS_READ_ONLY_PRODUCTION_SELLER_STORAGE_INVENTORY');assert.equal(inventory.primaryRedisTransferred,false);assert.equal(inventory.headroomReady,false);assert.equal(f.writes,0);assert.deepEqual(f.data,before);checks++;
 const init=await productionSellerStorageInventory({...f.options,action:'initialize'});assert.equal(init.status,'PASS_EXISTING_SCOPED_PRODUCTION_SELLER_STORAGE');assert.equal(init.maximumBytes,10000000);assert.equal(init.headroomReady,true);assert.equal(f.writes,1);assert.equal(init.namespaceFingerprint,sha(prefix));checks++;
 const recovered=await productionSellerStorageInventory({...f.options,action:'recover'});assert.equal(recovered.recoveredReadOnly,true);assert.equal(f.writes,1);checks++;
 const prior=f.data.get(f.storageKey);f.data.set(f.storageKey,'{"version":999}');await assert.rejects(productionSellerStorageInventory({...f.options,action:'initialize'}),/EXISTING_SCOPED_LEDGER_UNCONFIRMED/);assert.equal(f.writes,1);f.data.set(f.storageKey,prior);checks++;
 const m=fixture();await assert.rejects(productionSellerStorageInventory({...m.options,action:'recover'}),/NO_AUTOMATIC_RETRY/);assert.equal(m.writes,0);checks++;
 const lost=fixture();lost.loseAck();await assert.rejects(productionSellerStorageInventory({...lost.options,action:'initialize'}),/SYNTHETIC_LOST_ACK/);assert.equal(lost.writes,1);assert.equal((await productionSellerStorageInventory({...lost.options,action:'recover'})).recoveredReadOnly,true);assert.equal(lost.writes,1);checks++;
 const wrong=fixture();await assert.rejects(productionSellerStorageInventory({...wrong.options,action:'initialize',bindingHash:'0'.repeat(64)}),/ORIGINAL_PRODUCTION_BINDING_REQUIRED/);assert.equal(wrong.writes,0);checks++;
 const drift=fixture();let dataReads=0;drift.setRead((key,_n,data)=>{if(key.endsWith(':data:seller.hosted.tick')&&++dataReads===2)data.set(key,'synthetic changed checkpoint');});await assert.rejects(productionSellerStorageInventory({...drift.options,action:'initialize'}),/INVENTORY_CHANGED_NO_WRITE/);assert.equal(drift.writes,0);checks++;
 const orderChange=fixture();let marketReads=0;orderChange.options.primary={async get(){return ++marketReads===1?JSON.stringify({state:{orders:[],archived:[]}}):JSON.stringify({state:{orders:[],archived:[]},changed:true});}};await assert.rejects(productionSellerStorageInventory({...orderChange.options,action:'initialize'}),/ORDERS_CHANGED_NO_WRITE/);assert.equal(orderChange.writes,0);checks++;
 const unknown=JSON.parse(f.data.get(f.storageKey));unknown.entries['f'.repeat(64)]={bytes:1,expiresAt:0};f.data.set(f.storageKey,JSON.stringify(unknown));await assert.rejects(productionSellerStorageInventory({...f.options,action:'recover'}),/EXISTING_SCOPED_LEDGER_UNCONFIRMED/);assert.equal(f.writes,1);checks++;
 const noRoom=fixture();await assert.rejects(productionSellerStorageInventory({...noRoom.options,action:'initialize',headroom:async()=>({admissionReady:false})}),/HEADROOM_UNCONFIRMED/);assert.equal(noRoom.writes,1);checks++;
 for(const value of [config.ownerId,config.agentAccess,config.providerAccess])assert.ok(!JSON.stringify(init).includes(value));checks++;
 assert.equal(realNetworkRequests,0);checks++;
 console.log(JSON.stringify({status:'PASS_OFFLINE_PRODUCTION_SELLER_STORAGE_PREPARATION',checks,realNetworkRequests,privateProfilesRead:0,realRedisCommands:0,productionWrites:0,originalCheckpointBindingPreserved:true,uncertainInitializationRecoversReadOnlyWithoutReseed:true,rootRedisTransferred:false,providerExecutions:0,payments:0,productionPublished:false,cronActivated:false}));
}finally{globalThis.fetch=oldFetch;}
