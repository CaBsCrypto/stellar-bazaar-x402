import {createHash,randomUUID} from 'node:crypto';
import {TREASURY} from '../policy-router/fee-split-policy-v1.mjs';
import {USDC_ISSUER,TREASURY_ACCOUNT_URL} from './treasury-account-reader.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const hash=v=>createHash('sha256').update(v).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,owner=/^ow_[a-f0-9]{32}$/;
export function nativeIdentityRegistryGuard(snapshot,workspacePrefix){
 const key=workspacePrefix+':{'+workspacePrefix.split(':')[1]+'}:registry',g=snapshot?.guard;need(g&&Array.isArray(g.keys)&&g.keys.length===g.values?.length&&g.keys[0]===key&&typeof g.values[0]==='string'&&Buffer.byteLength(g.values[0])<=32768,'TREASURY_NATIVE_REGISTRY_GUARD_REQUIRED');
 // Role, wallet, revocation and generation are in this exact native registry.
 // Market publication permissions are NOT identity authority and are never
 // used by this binding. Their separate guard remains mandatory in the seller
 // publication path; this normalization cannot grant service permissions.
 return {keys:[key],values:[g.values[0]]};
}
export function treasuryBindingKey(prefix){need(/^bazaar-market:pilot-[a-f0-9]{32}$/.test(prefix),'TREASURY_BINDING_NAMESPACE_INVALID');return prefix+':split:v1:treasury-binding';}
export function parseTreasuryBinding(raw){
 if(raw===null||raw===undefined)return null;need(typeof raw==='string'&&Buffer.byteLength(raw)<=4096,'TREASURY_BINDING_INVALID');let row;try{row=JSON.parse(raw);}catch{throw Error('TREASURY_BINDING_INVALID');}
 need(row&&Object.keys(row).sort().join(',')==='account,agentId,chainEvidenceDigest,changeId,createdAt,generation,network,ownerId,ownerRecoveryAcknowledgedAt,revision,updatedAt,version,workspaceId'&&row.version==='bazaar.treasury-binding/v1'&&row.network==='stellar:testnet'&&row.account===TREASURY&&owner.test(row.ownerId)&&typeof row.agentId==='string'&&/^agent_[a-f0-9]{32}$/.test(row.agentId)&&uuid.test(row.workspaceId)&&uuid.test(row.changeId)&&uuid.test(row.revision)&&Number.isSafeInteger(row.generation)&&row.generation>0&&Number.isSafeInteger(row.createdAt)&&row.createdAt>0&&Number.isSafeInteger(row.updatedAt)&&row.updatedAt>=row.createdAt&&Number.isSafeInteger(row.ownerRecoveryAcknowledgedAt)&&row.ownerRecoveryAcknowledgedAt>=row.createdAt&&row.ownerRecoveryAcknowledgedAt<=row.updatedAt&&/^[a-f0-9]{64}$/.test(row.chainEvidenceDigest),'TREASURY_BINDING_INVALID');return row;
}
function currentHuman(p){need(p&&p.role==='human'&&owner.test(p.ownerId)&&uuid.test(p.workspaceId)&&/^agent_[a-f0-9]{32}$/.test(p.agentId)&&Number.isSafeInteger(p.generation)&&p.generation>0,'TREASURY_HUMAN_OWNER_REQUIRED');}
function chainValid(e,now){need(e&&Object.keys(e).sort().join(',')==='account,accountDataHash,asset,availableToReceiveAtomic,consensusProofVerified,issuer,network,observedAt,source,version'&&e.version==='bazaar.treasury-account-observation/v1'&&e.account===TREASURY&&e.network==='stellar:testnet'&&e.asset==='USDC'&&e.issuer===USDC_ISSUER&&e.source===TREASURY_ACCOUNT_URL&&e.consensusProofVerified===false&&Number.isSafeInteger(e.observedAt)&&e.observedAt<=now&&now-e.observedAt<=300000&&typeof e.availableToReceiveAtomic==='string'&&/^[0-9]{1,20}$/.test(e.availableToReceiveAtomic)&&BigInt(e.availableToReceiveAtomic)>=1500n&&/^[a-f0-9]{64}$/.test(e.accountDataHash),'TREASURY_CHAIN_EVIDENCE_REQUIRED');return e;}
function storageValid(plan){need(plan?.keys?.length===1&&plan.args?.length===2&&typeof plan.appendScript==='function'&&typeof plan.writeScript==='function','TREASURY_BINDING_STORAGE_UNAVAILABLE');return plan;}
/** Pure exact native script descriptor for transport accounting. Calling this
 * grants no operator, HUMAN, wallet or storage authority and performs no IO. */
export function treasuryBindingCasScript(plan){const storage=storageValid(plan);return `-- bazaar-native-treasury-binding-cas-v1\nif #KEYS~=3 or #ARGV~=7 then return -2 end\nlocal clock=redis.call('TIME');local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000);if now>=tonumber(ARGV[7]) then return -2 end\nfor i=1,3 do local t=redis.call('TYPE',KEYS[i]);if type(t)=='table' then t=t.ok end;if t~='none' and t~='string' then return -2 end end\nlocal old=redis.call('GET',KEYS[1]);if ARGV[1]=='missing' then if old then return 0 end elseif old~=ARGV[1] then return 0 end\nif redis.call('GET',KEYS[2])~=ARGV[3] then return 0 end\n${storage.appendScript(3,4)}\nredis.call('SET',KEYS[1],ARGV[2]);${storage.writeScript(3)}return 1`;}
/** Protected metadata only: this store has no order, budget, payment, hold,
 * wallet-creation or seller-renewal authority. Operator authentication belongs
 * to the native HTTP wrapper and is independently rechecked by this callback. */
export function createTreasuryBindingStore({redis,marketPrefix,workspacePrefix,workspaceSnapshot,storagePlan,readChainEvidence,operatorMatches,now=Date.now}={}){
 const key=treasuryBindingKey(marketPrefix);need(workspacePrefix===marketPrefix.replace('bazaar-market:','bazaar-workspace:')&&redis&&typeof redis.get==='function'&&typeof redis.eval==='function'&&typeof workspaceSnapshot==='function'&&typeof storagePlan==='function'&&typeof readChainEvidence==='function'&&typeof operatorMatches==='function','TREASURY_BINDING_NOT_CONFIGURED');
 async function identity(p){currentHuman(p);const s=await workspaceSnapshot(p);need(s.identity?.ownerId===p.ownerId&&s.identity.workspaceId===p.workspaceId&&s.identity.agentId===p.agentId&&s.identity.generation===p.generation&&s.identity.role==='human'&&s.identity.purpose==='treasury-controls'&&s.identity.wallet?.wallet===TREASURY&&s.identity.wallet.network==='stellar:testnet'&&Number.isFinite(Date.parse(s.identity.wallet.verifiedAt))&&Date.parse(s.identity.wallet.verifiedAt)>0&&Date.parse(s.identity.wallet.verifiedAt)<=now(),'TREASURY_NATIVE_WALLET_NOT_BOUND');return {identity:s.identity,guard:nativeIdentityRegistryGuard(s,workspacePrefix)};}
 async function readCurrent({refreshChain=false}={}){
  const raw=await redis.get(key),binding=parseTreasuryBinding(raw);if(!binding)return null;
  const p={role:'human',ownerId:binding.ownerId,workspaceId:binding.workspaceId,agentId:binding.agentId,generation:binding.generation},id=await identity(p);
  const observation=refreshChain?chainValid(await readChainEvidence(),now()):undefined;
  return {binding,...(observation?{treasury:{ownerId:binding.ownerId,account:TREASURY,ownerRecoveryAcknowledgedAt:binding.ownerRecoveryAcknowledgedAt,receiptEligible:true,observedAt:observation.observedAt,availableToReceiveAtomic:observation.availableToReceiveAtomic,chainEvidenceDigest:hash(JSON.stringify(observation))}}:{}),guard:{keys:[...id.guard.keys,key],values:[...id.guard.values,raw]}};
 }
 async function bind({principal:p,changeId,expectedRevision,recoveryAcknowledged,operatorRequest}={}){
  need(operatorMatches(operatorRequest)===true,'TREASURY_OPERATOR_REQUIRED');currentHuman(p);need(uuid.test(changeId)&&recoveryAcknowledged===true&&(expectedRevision===null||uuid.test(expectedRevision)),'TREASURY_BINDING_REQUEST_INVALID');
  const id=await identity(p),raw=await redis.get(key),previous=parseTreasuryBinding(raw);
  if(previous){need(previous.ownerId===p.ownerId&&previous.workspaceId===p.workspaceId&&previous.agentId===p.agentId,'TREASURY_OWNER_REASSIGNMENT_FORBIDDEN');
   if(previous.changeId===changeId){need(previous.generation===p.generation,'TREASURY_BINDING_GENERATION_CHANGED');return {binding:previous,created:false,chainRevalidated:false};}}
  need((previous?.revision??null)===expectedRevision,'TREASURY_BINDING_CONFLICT');
  const observation=chainValid(await readChainEvidence(),now()),at=now();
  const binding={version:'bazaar.treasury-binding/v1',account:TREASURY,network:'stellar:testnet',ownerId:p.ownerId,workspaceId:p.workspaceId,agentId:p.agentId,generation:p.generation,changeId,revision:randomUUID(),createdAt:previous?.createdAt??at,updatedAt:at,ownerRecoveryAcknowledgedAt:at,chainEvidenceDigest:hash(JSON.stringify(observation))},next=JSON.stringify(binding);parseTreasuryBinding(next);
  const storage=storageValid(await storagePlan([{key,expectedRaw:raw??null,nextRaw:next,reservedBytes:4096}]));
  need(storage.keys[0]===workspacePrefix+':{'+workspacePrefix.split(':')[1]+'}:continuous-free-storage:v1','TREASURY_BINDING_STORAGE_KEY_INVALID');
  need(operatorMatches(operatorRequest)===true,'TREASURY_OPERATOR_REQUIRED');
  const script=treasuryBindingCasScript(storage);
  let result;try{result=await redis.eval(script,[key,id.guard.keys[0],storage.keys[0]],[raw??'missing',next,id.guard.values[0],...storage.args,'',String(Math.min(at+5000,observation.observedAt+300000))]);}catch{throw Error('TREASURY_BINDING_WRITE_UNCONFIRMED');}
  need(result===1,result===0?'TREASURY_BINDING_CONFLICT':'TREASURY_BINDING_WRITE_UNCONFIRMED');return {binding,created:previous===null,chainRevalidated:true};
 }
 return Object.freeze({key,bind,readCurrent});
}
