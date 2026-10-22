import {Redis} from '@upstash/redis';
import {meteredRedis} from '../../../acceptance-meter.ts';
import {configuredWorkspaceStore,workspacePrefix} from '../../../workspace-store.ts';
import {configuredMarketStore,marketPrefix} from '../../../marketplace-store.ts';
import {configuredMarketOrderRepository} from '../../../market-order-storage.ts';
import {continuousFreeBudgetConfiguration,CONTINUOUS_FREE_BUDGET_FUNCTIONS} from '../../../continuous-free-budget.ts';
import {prepareContinuousStorageCommit} from '../../../continuous-free-storage.ts';
import {operationalCheckpointSchema} from '../../../operational-budget.ts';
import type {WorkspacePrincipal} from '../../../workspace-types.ts';
import {createNativeSplitAdmission} from './admission.mjs';
import {createSplitOrderStore} from './store.mjs';
import {nativeIdentityRegistryGuard} from './treasury-binding.mjs';
import {configuredNativeTreasuryComponents} from './treasury-composition.ts';
import {createNativeSplitDependencyFactories} from './dependency-factories.mjs';
import {createNativeAdapterAuthorization} from './adapters-authorization.mjs';
import {STAGE_ACCOUNTING_VERSION,STAGE_ACCOUNTING_VERSION_V2} from './stage-accounting.mjs';

type NativeRedis={get(key:string):Promise<unknown>;eval(script:string,keys:string[],args:string[]):Promise<unknown>};
type NativeComponentsInput={redis:NativeRedis;mp:string;wp:string;workspace:{walletIdentity(p:WorkspacePrincipal):Promise<any>};treasury:{readCurrent(options?:{refreshChain?:boolean}):Promise<any>};historyKey:Buffer;sourceDigest?:string;accountingVersion?:typeof STAGE_ACCOUNTING_VERSION|typeof STAGE_ACCOUNTING_VERSION_V2};
/** Same native composition for runtime and local backend fixtures. None of the
 * callbacks accepts client authority JSON. Read paths require actual native
 * identity only; current operational/treasury evidence is read on financial
 * admission. Production writes remain explicitly OFF regardless of flags. */
export function createNativeSplitComponents(input:NativeComponentsInput){
 const {redis,mp,wp,workspace,treasury,historyKey,sourceDigest}=input;
 if(!/^bazaar-market:pilot-[a-f0-9]{32}$/.test(mp)||mp.replace('bazaar-market:','bazaar-workspace:')!==wp||!Buffer.isBuffer(historyKey)||historyKey.length!==32)throw Error('NATIVE_SPLIT_CONFIGURATION_UNAVAILABLE');
 const namespace='bazaar:split:v1:pilot:'+mp.slice('bazaar-market:pilot-'.length);
 const admission=createNativeSplitAdmission({redis,marketPrefix:mp,workspacePrefix:wp,sourceDigest,accountingVersion:input.accountingVersion??STAGE_ACCOUNTING_VERSION,budgetConfiguration:()=>continuousFreeBudgetConfiguration(),budgetFunctions:CONTINUOUS_FREE_BUDGET_FUNCTIONS,
  workspaceSnapshot:async(p:WorkspacePrincipal)=>{const snapshot=await workspace.walletIdentity(p);return {...snapshot,guard:nativeIdentityRegistryGuard(snapshot,wp)};},
  treasurySnapshot:()=>treasury.readCurrent({refreshChain:true}),
  marketSnapshot:async()=>{const native=configuredMarketStore();if(!native.orderAdmissionSnapshot)throw Error('NATIVE_SPLIT_LEGACY_SNAPSHOT_UNAVAILABLE');return native.orderAdmissionSnapshot();},
  repositorySnapshot:(ownerId:string,role:'buyer'|'seller-pending')=>configuredMarketOrderRepository().admissionSnapshot(ownerId,role,{limit:50}),
  storagePlan:(writes:Parameters<typeof prepareContinuousStorageCommit>[2])=>prepareContinuousStorageCommit(redis as Redis,wp,writes),
  checkpointSnapshot:async()=>{
   const key=wp+':operations-budget:state',proofKey=mp+':split:v1:operational-proof',rows=await Promise.all([redis.get(key),redis.get(proofKey)]),[raw,proofRaw]=rows;
   if(typeof raw!=='string'||Buffer.byteLength(raw)>65536||typeof proofRaw!=='string'||Buffer.byteLength(proofRaw)>32768)throw Error('NATIVE_SPLIT_CHECKPOINT_UNAVAILABLE');
   const native=JSON.parse(raw),proof=JSON.parse(proofRaw),cp=operationalCheckpointSchema.parse(native.checkpoint);
   if(native.version!==1||proof.version!=='bazaar.split-operational-proof/v1'||proof.epoch!==cp.epoch||proof.sourceDigest!==sourceDigest)throw Error('NATIVE_SPLIT_CHECKPOINT_INVALID');
   return {observedAt:Date.parse(cp.observedAt),expiresAt:Date.parse(cp.expiresAt),remaining:cp.remaining,evidence:cp.evidence,costCertificate:proof.costCertificate,guard:{keys:[key,proofKey],values:[raw,proofRaw]}};
  },
 });
 const adapterAuthorization=createNativeAdapterAuthorization({redis,namespace,sourceDigest,budgetConfiguration:()=>continuousFreeBudgetConfiguration(),budgetFunctions:CONTINUOUS_FREE_BUDGET_FUNCTIONS,storagePlan:(writes:Parameters<typeof prepareContinuousStorageCommit>[2])=>prepareContinuousStorageCommit(redis as Redis,wp,writes)});
 const store=createSplitOrderStore({redis,namespace,nativeAdmission:admission}),dependencies=createNativeSplitDependencyFactories({redis,namespace,adapterAuthorization,fetcher:fetch});
 return {admission,adapterAuthorization,stageAccounting:admission.stageAccounting,store,historyKey,resolveService:admission.resolveService,dependencyFactories:dependencies,financialAuthority:dependencies.financialAuthority,journal:dependencies.journal,transport:dependencies.transport(),context:dependencies.context,prepareChallenge:dependencies.prepareChallenge,rpc:dependencies.rpcForOrder,writeEnabled:false};
}
/** Lazy factory: no import-time IO or credential read. Cursor material is an
 * existing server secret, never generated here or supplied by an HTTP caller. */
export function configuredNativeSplitComponents(){
 const accounting=process.env.BAZAAR_SPLIT_ACCOUNTING_PROFILE;
 if(accounting!==undefined&&accounting!=='v1'&&accounting!=='v2')throw Error('SPLIT_STAGE_PROFILE_UNKNOWN');
 if(process.env.BAZAAR_WORKSPACE_BACKEND!=='redis'||process.env.BAZAAR_FREE_DEMO_MODE!=='continuous'||process.env.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE!=='compact-registry-v2')throw Error('NATIVE_SPLIT_RUNTIME_UNAVAILABLE');
 const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN,key=process.env.BAZAAR_SPLIT_HISTORY_CURSOR_KEY;
 if(!url||!token)throw Error('NATIVE_SPLIT_REDIS_UNAVAILABLE');const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('NATIVE_SPLIT_REDIS_UNAVAILABLE');
 if(!key||!/^[a-f0-9]{64}$/.test(key))throw Error('NATIVE_SPLIT_HISTORY_KEY_UNAVAILABLE');
 const redis=meteredRedis(new Redis({url,token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false}));
 return createNativeSplitComponents({redis,mp:marketPrefix(),wp:workspacePrefix(),workspace:configuredWorkspaceStore(),treasury:configuredNativeTreasuryComponents().store,historyKey:Buffer.from(key,'hex'),sourceDigest:process.env.BAZAAR_SPLIT_SOURCE_DIGEST,accountingVersion:accounting==='v2'?STAGE_ACCOUNTING_VERSION_V2:STAGE_ACCOUNTING_VERSION});
}
