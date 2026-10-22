import type {WorkspacePrincipal} from '../../../workspace-types.ts';
import type {ContinuousFreeConfiguration} from '../../../continuous-free-budget.ts';
import type {ContinuousStorageWrite,prepareContinuousStorageCommit} from '../../../continuous-free-storage.ts';

export type SplitStageAction='read'|'challenge'|'settle'|'reconcile'|'delivery-read'|'delivery-write';
export type SplitStageRole='buyer'|'seller';
export type SplitStagePhase='awaiting-payment'|'payment-submitting'|'payment-uncertain'|'paid'|'delivered'|'delivery-failed';
export type SplitStagePrincipal=Pick<WorkspacePrincipal,'ownerId'|'workspaceId'|'agentId'|'generation'>&{role:'agent'};
export interface SplitStagePlanEntry {
 readonly action:SplitStageAction;
 readonly maxCalls:number;
 readonly profile:'recovery';
 readonly commands:number;
 readonly transferBytes:number;
 readonly phases:readonly SplitStagePhase[];
 readonly roles:readonly SplitStageRole[];
}
export const STAGE_ACCOUNTING_VERSION:'bazaar.split-stage-accounting/v1';
export const STAGE_ACCOUNTING_VERSION_V2:'bazaar.split-stage-accounting/v2';
export type StageAccountingVersion=typeof STAGE_ACCOUNTING_VERSION|typeof STAGE_ACCOUNTING_VERSION_V2;
export const STAGE_OVERHEAD_BOUND:Readonly<{commands:number;wireBytes:number;requests:number;stageRecordBytes:number;scriptBytes:number;storageTotalBytes:number}>;
export const STAGE_PLAN:Readonly<Record<SplitStageAction,Readonly<SplitStagePlanEntry>>>;
export const STAGE_RECIPE:Readonly<{
 version:typeof STAGE_ACCOUNTING_VERSION;
 stages:typeof STAGE_PLAN;
 maintenanceBytes:number;
 safetyBytes:number;
 globalControlsIncluded:false;
 completeFinancialBudgetCertified:false;
}>;
export const STAGE_RECIPE_DIGEST:string;
export const STAGE_RECIPE_V2:Readonly<Omit<typeof STAGE_RECIPE,'version'>&{version:typeof STAGE_ACCOUNTING_VERSION_V2;terminalRetention:Readonly<{historyCalls:number;transferBytes:number;recoveryCommands:number;backgroundCommands:number;storageRetentionBytes:number}>}>;
export const STAGE_RECIPE_DIGEST_V2:string;
export function stageProfile(version?:StageAccountingVersion):Readonly<{version:StageAccountingVersion;plan:typeof STAGE_PLAN;recipe:typeof STAGE_RECIPE|typeof STAGE_RECIPE_V2;digest:string}>;

export interface SplitStageOrderBinding {
 operationId:string;
 policyHash:string;
 buyerOwnerId:string;
 sellerOwnerId:string;
 treasuryOwnerId:string;
}
export interface SplitStageClaim {
 status:'claimed';
 action:SplitStageAction;
 requestHash:string;
 ownerId:string;
 generation:number;
 slot:number;
 phase:SplitStagePhase;
 claimedAt:number;
}
export interface SplitStageRecord {
 version:typeof STAGE_ACCOUNTING_VERSION;
 operationId:string;
 sourceDigest:string;
 recipeDigest:string;
 policyHash:string;
 buyerPrincipalHash:string;
 storageKeyHash:string;
 buyer:SplitStagePrincipal;
 seller:SplitStagePrincipal;
 treasuryOwnerId:string;
 claims:Record<string,SplitStageClaim>;
 used:Partial<Record<SplitStageAction,number>>;
}
export function stageAccountingKey(namespace:string,operationId:string):string;
export function makeStageRecord(input:{order:SplitStageOrderBinding;buyerPrincipal:WorkspacePrincipal;sellerPrincipal:WorkspacePrincipal;sourceDigest:string;namespace:string;version?:StageAccountingVersion}):SplitStageRecord;
export function parseStageRecord(raw:unknown,binding:{operationId:string;sourceDigest:string;policyHash:string;namespace:string;version?:StageAccountingVersion}):SplitStageRecord;

export type SplitStageStorageCommit=NonNullable<Awaited<ReturnType<typeof prepareContinuousStorageCommit>>>;
export function stageClaimScript(budgetFunctions:string,storage:SplitStageStorageCommit,binding:{sourceDigest:string;namespace?:string;budgetKey?:string;version?:StageAccountingVersion}):string;
export interface SplitStageRedis {
 get(key:string):Promise<unknown>;
 eval(script:string,keys:string[],args:string[]):Promise<unknown>;
}
export interface SplitStageWorkspaceSnapshot {
 identity:Pick<WorkspacePrincipal,'ownerId'|'workspaceId'|'agentId'|'generation'>;
 guard:{keys:string[];values:string[]};
}
export interface SplitStageAccountingOptions {
 version?:StageAccountingVersion;
 redis:SplitStageRedis;
 namespace:string;
 budgetKey:string;
 budgetConfiguration:()=>ContinuousFreeConfiguration|undefined;
 budgetFunctions:string;
 workspaceSnapshot:(principal:WorkspacePrincipal)=>Promise<SplitStageWorkspaceSnapshot>;
 storagePlan:(writes:ContinuousStorageWrite[])=>Promise<SplitStageStorageCommit|undefined>;
 sourceDigest:string;
 now?:()=>number;
}
export interface SplitStageRequest {
 principal:WorkspacePrincipal;
 request:Request;
 operationId:string;
 claimId:string;
}
/** Minted against the exact Request in the implementation's WeakMap.
 * Structural TypeScript compatibility does not mint runtime authority. */
export interface AcceptedSplitStageReceipt {
 readonly status:'claimed';
 readonly accountingVersion:StageAccountingVersion;
 readonly expiresAtMs:number;
 readonly role:'agent';
 readonly workspaceId:string;
 readonly agentId:string;
 readonly operationId:string;
 readonly claimId:string;
 readonly action:SplitStageAction;
 readonly ownerId:string;
 readonly generation:number;
 readonly policyHash:string;
 readonly orderRevision:string;
 readonly requestHash:string;
 readonly sourceDigest:string;
 readonly recipeDigest:string;
 readonly mayExecuteHandler:true;
 readonly mayDispatch:false;
}
export type SplitStageClaimResult=Readonly<AcceptedSplitStageReceipt>|{status:'replay'|'unmanaged';mayExecuteHandler:false;mayDispatch:false};
export interface SplitStageLookup {
 status:'claimed'|'absent';
 claim:SplitStageClaim|null;
 readOnly:true;
 mayExecuteHandler:false;
 mayDispatch:false;
}
export interface SplitStageTailReport {
 perOperationTailFunded:boolean;
 requiredRemainingBytes:number;
 requiredRemainingRecoveryCommands:number;
 remainingHeldBytes:number;
 remainingHeldRecoveryCommands:number;
 globalControlsIncluded:false;
 completeFinancialBudgetCertified:false;
 mayDispatch:false;
 readOnly:true;
}
export interface SplitStageAccounting {
 claim(input:SplitStageRequest):Promise<SplitStageClaimResult>;
 lookup(input:SplitStageRequest):Promise<SplitStageLookup>;
 inspectTail(input:SplitStageRequest):Promise<SplitStageTailReport>;
 assertDispatchTail(input:SplitStageRequest):Promise<never>;
 readonly version:StageAccountingVersion;
 readonly recipe:typeof STAGE_RECIPE|typeof STAGE_RECIPE_V2;
 readonly financialReady:false;
}
export function createSplitStageAccounting(options:SplitStageAccountingOptions):Readonly<SplitStageAccounting>;
export function acceptedStageReceipt(request:Request):Readonly<AcceptedSplitStageReceipt>|undefined;
export function takeConsumedStageReceipt(request:Request,receipt:Readonly<AcceptedSplitStageReceipt>,options?:{now?:()=>number}):Readonly<AcceptedSplitStageReceipt>;
export function consumeAcceptedStageReceipt(request:Request,binding:{principal:WorkspacePrincipal;operationId:string;action:SplitStageAction;order:{operationId:string;policyHash:string;revision:string;accountingProfile?:string};sourceDigest:string;now?:()=>number}):Readonly<AcceptedSplitStageReceipt>;
