import type {WorkspacePrincipal} from '../../../workspace-types.ts';
import type {ContinuousFreeConfiguration} from '../../../continuous-free-budget.ts';
import type {ContinuousStorageWrite,prepareContinuousStorageCommit} from '../../../continuous-free-storage.ts';
import type {SplitPolicy} from '../policy-router/fee-split-policy-v1.mjs';
import type {SignedRouterPacket} from '../channels-adapter/adapter.mjs';
import type {NativeJournalGuard,NativeJournalWriteInput} from '../channels-adapter/redis-journal.mjs';
import type {AcceptedSplitStageReceipt,SplitStageOrderBinding,SplitStagePhase,SplitStageRedis} from './stage-accounting.mjs';
import type {PreparationBinding,PreparationRpcDescriptor} from './contract-context.mjs';
declare const opaqueCapability:unique symbol;
/** Runtime authority is a private WeakMap entry; this type cannot attest JSON. */
export type NativeAdapterCapability=object&{readonly[opaqueCapability]:true};
export interface NativeAdapterOrder extends SplitStageOrderBinding {policy:SplitPolicy;revision:string;phase:SplitStagePhase;accountingProfile?:string}
export type NativeAdapterPurpose=PreparationBinding['purpose']|'transaction'|'journal';
export interface NativeAdapterPublicBinding extends Omit<PreparationBinding,'purpose'> {purpose:NativeAdapterPurpose}
export interface NativeAdapterDescription extends NativeAdapterPublicBinding {expiresAtMs:number;policy:Readonly<SplitPolicy>;principal:Readonly<WorkspacePrincipal>;revision:string;packetHash:string|null}
export interface NativeAdapterAuthorizationOptions {redis:SplitStageRedis;namespace:string;sourceDigest?:string;budgetConfiguration:()=>ContinuousFreeConfiguration|undefined;budgetFunctions:string;storagePlan:(writes:ContinuousStorageWrite[])=>Promise<NonNullable<Awaited<ReturnType<typeof prepareContinuousStorageCommit>>>|undefined>;now?:()=>number}
export function createAuthorizationScripts(options:{namespace:string;sourceDigest:string;budgetFunctions:string;storageTemplate:NonNullable<Awaited<ReturnType<typeof prepareContinuousStorageCommit>>>}):Readonly<{assert:string;rpc:string;advance:string;journalRead:string;journalInspect:string;journalWrite:string}>;
export interface NativeAdapterAuthorization {
 bind(input:{request:Request;principal:WorkspacePrincipal;order:NativeAdapterOrder;receipt:Readonly<AcceptedSplitStageReceipt>}):Promise<NativeAdapterCapability>;
 assertBinding(capability:object,binding:NativeAdapterPublicBinding):Promise<void>;
 authorizeRpcRequest(capability:object,descriptor:Readonly<PreparationRpcDescriptor>|(NativeAdapterPublicBinding&{endpoint:'https://soroban-testnet.stellar.org/';method:'POST';rpcMethod:'getTransaction';maximumAttempts:1;outboundBytes:number;maximumInboundBytes:number;maximumHeaderBytes:number;timeoutMs:number})):Promise<void>;
 advance(capability:NativeAdapterCapability,order:NativeAdapterOrder):Promise<void>;
 bindPacket(capability:NativeAdapterCapability,packet:SignedRouterPacket,authorizationHash:string|null):void;
 journalRead(capability:NativeAdapterCapability,key:string,action?:'read'|'transition'):Promise<string|null>;
 journalWriteGuard(capability:NativeAdapterCapability,input:NativeJournalWriteInput):NativeJournalGuard;
 sourceAccountForBinding(input:{capability:object;policy:SplitPolicy}):Promise<{accountId:string;policyHash:string;sourceDigest:string}>;
 describe(capability:NativeAdapterCapability,purpose:NativeAdapterPurpose):Readonly<NativeAdapterDescription>;
 costSnapshot(capability:NativeAdapterCapability):Readonly<Record<string,unknown>>;
 readonly financialReady:false;
}
export function createNativeAdapterAuthorization(options:NativeAdapterAuthorizationOptions):NativeAdapterAuthorization;
