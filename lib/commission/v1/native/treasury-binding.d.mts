import type {TreasuryObservation} from './treasury-account-reader.mjs';
export interface NativeGuard {keys:string[];values:(string|null)[];}
export interface TreasuryBinding {version:'bazaar.treasury-binding/v1';account:string;network:'stellar:testnet';ownerId:string;workspaceId:string;agentId:string;generation:number;changeId:string;revision:string;createdAt:number;updatedAt:number;ownerRecoveryAcknowledgedAt:number;chainEvidenceDigest:string;}
export function nativeIdentityRegistryGuard(snapshot:any,workspacePrefix:string):NativeGuard;
export function treasuryBindingKey(prefix:string):string;
export function parseTreasuryBinding(raw:unknown):TreasuryBinding|null;
export function treasuryBindingCasScript(storage:unknown):string;
export interface TreasuryBindingStore {key:string;bind(input:{principal:any;changeId:string;expectedRevision:string|null;recoveryAcknowledged:true;operatorRequest:Request}):Promise<{binding:TreasuryBinding;created:boolean;chainRevalidated:boolean}>;readCurrent(options?:{refreshChain?:boolean}):Promise<{binding:TreasuryBinding;guard:NativeGuard;treasury?:{ownerId:string;account:string;ownerRecoveryAcknowledgedAt:number;receiptEligible:true;observedAt:number;availableToReceiveAtomic:string;chainEvidenceDigest:string}}|null>;}
export function createTreasuryBindingStore(options:Record<string,unknown>):TreasuryBindingStore;
