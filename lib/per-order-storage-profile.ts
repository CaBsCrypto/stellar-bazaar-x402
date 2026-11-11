import {createHash} from 'node:crypto';
import {WorkspaceError} from './workspace-types.ts';
import {perOrderPaymentPreparationMetadata} from './per-order-payment-profile.ts';

type Environment=Readonly<Record<string,string|undefined>>;
const commandConfiguration='cffe2b85e9f007d5bbfefcd78178a726868b694494e8860d9120f54560fec405';
/** A source-controlled storage rollout gate. It never creates a budget, raises
 * its cap, changes an existing reservation, or grants permission to pay. */
export function assertPerOrderStorageProfile(environment:Environment=process.env):'local'|'continuous'{
 if(environment.BAZAAR_MARKET_ORDER_STORAGE!=='per-order-v1')throw new WorkspaceError('PER_ORDER_STORAGE_DISABLED',503);
 if(['test','development'].includes(environment.NODE_ENV??'')&&environment.VERCEL===undefined&&environment.VERCEL_ENV===undefined&&environment.BAZAAR_FREE_DEMO_MODE!=='continuous')return 'local';
 const invalid=()=>new WorkspaceError('PER_ORDER_STORAGE_CONFIGURATION_INCOMPLETE',503);
 if(environment.NODE_ENV!=='production'||environment.VERCEL_ENV!=='production'||environment.BAZAAR_WORKSPACE_BACKEND!=='redis'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||environment.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE!=='compact-registry-v2'||!['9900000000','9950000000'].includes(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES??'')||environment.BAZAAR_FREE_DEMO_ADMISSION_UNTIL!==undefined)throw invalid();
 const prefix=environment.BAZAAR_WORKSPACE_PREFIX;
 if(!/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(prefix??'')||environment.BAZAAR_MARKET_PREFIX!==prefix!.replace('bazaar-workspace:','bazaar-market:'))throw invalid();
 // Keep the exact deployed command configuration. No migration/reset of the
 // native rolling ledger is permitted when this storage profile is enabled.
 try{const raw=environment.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON;if(raw===undefined||Buffer.byteLength(raw)>512)throw Error();const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='authenticated,background,public,recovery')throw Error();
  const ordered=Object.fromEntries((['public','authenticated','recovery','background'] as const).map(name=>[name,value[name]]));
  if(Object.values(ordered).some(value=>!Number.isSafeInteger(value)||Number(value)<1)||createHash('sha256').update(JSON.stringify(ordered)).digest('hex')!==commandConfiguration)throw Error();
 }catch{throw invalid();}
 if(environment.BAZAAR_TEXT_SELLER_MODE!=='on-demand'||environment.BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID!=='31c97193-be74-4b9d-b0a3-f3890b0a41e8'||environment.BAZAAR_TEXT_SELLER_SERVICE_ID!=='guionista-bazaar-production-text-v1'||!/^[a-f0-9]{64}$/.test(environment.BAZAAR_TEXT_SELLER_CARD_HASH??'')||!/^[a-f0-9]{64}$/.test(environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT??''))throw invalid();
 return 'continuous';
}
export function continuousPerOrderStorage(environment:Environment=process.env){return environment.BAZAAR_MARKET_ORDER_STORAGE==='per-order-v1'&&assertPerOrderStorageProfile(environment)==='continuous';}
/** Public configuration metadata only; no catalogue, account or Redis read. */
export function marketOrderStorageMetadata(environment:Environment=process.env){
 const configured=environment.BAZAAR_MARKET_ORDER_STORAGE;
 if(configured===undefined||configured==='legacy')return {effectiveOrderStorageProfile:'legacy',newProfileSignedPaymentsEnabled:false};
 try{assertPerOrderStorageProfile(environment);const preparation=perOrderPaymentPreparationMetadata(environment);return {effectiveOrderStorageProfile:'per-order-v1',newProfileUnsignedOrderCreationSupported:true,newProfilePrivateHistorySupported:true,newProfileSignedPaymentsEnabled:preparation.productionPaymentsEnabled,...(!preparation.productionPaymentsEnabled?{paymentBlockCode:'PER_ORDER_PAYMENTS_NOT_ENABLED'}:{}),paymentPreparation:preparation,liveAdmissionVerified:false};}
 catch{return {effectiveOrderStorageProfile:'unavailable',newProfileUnsignedOrderCreationSupported:false,newProfilePrivateHistorySupported:false,newProfileSignedPaymentsEnabled:false,liveAdmissionVerified:false};}
}
