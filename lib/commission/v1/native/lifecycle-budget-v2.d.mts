export interface RetentionBounds {transferBytes:number;recoveryCommands:number;backgroundCommands:number;storageRetentionBytes:number;}
export const LIFECYCLE_BUDGET_VERSION:'bazaar.split-lifecycle-budget/v2';
export const LIFECYCLE_CERTIFICATE_VERSION:'bazaar.lifecycle-certificate/v2';
export const LIFECYCLE_RETENTION_FLOOR:Readonly<RetentionBounds>;
export const LIFECYCLE_PROFILE:Readonly<{version:typeof LIFECYCLE_BUDGET_VERSION;stageVersion:'bazaar.split-stage-accounting/v2';newOrdersOnly:true;activationReady:false;fullBudgetCertified:false;financialReady:false}>;
export interface TerminalInput {previous:Record<string,any>;next:Record<string,any>;namespace:string;sourceDigest:string;recipeDigest:string;stageRaw:string;}
export interface TerminalCandidate {version:typeof LIFECYCLE_BUDGET_VERSION;operationId:string;sourceDigest:string;recipeDigest:string;policyHash:string;transactionHash:string;deliverySha256:string;buyerPrincipalHash:string;closureDigest:string;remainingStages:Readonly<Record<string,{maxCalls:number;transferBytes:number;recoveryCommands:number}>>;remainingStageTransferBytes:number;remainingStageRecoveryCommands:number;minimumRetention:Readonly<RetentionBounds>;candidateOnly:true;activationReady:false;}
declare const terminalBrand:unique symbol;
export interface NativeTerminalTransition {readonly [terminalBrand]:true;readonly version:typeof LIFECYCLE_BUDGET_VERSION;readonly operationId:string;readonly candidate:TerminalCandidate;}
export interface LifecycleCertificate {version:typeof LIFECYCLE_CERTIFICATE_VERSION;profile:'bazaar.split-stage-accounting/v2';sourceDigest:string;recipeDigest:string;certificateDigest:string;artifactPins:{costModuleSha256:string;retentionProofSha256:string;pipelineProofSha256:string};issuedAtMs:number;expiresAtMs:number;fullPipelineCertified:true;retention:RetentionBounds;}
export function lifecycleCertificateKey(marketPrefix:string,sourceDigest:string):string;
/** Diagnostic only; the returned parsed object is never release authority. */
export function validateLifecycleCertificate(raw:string,binding:{sourceDigest:string;recipeDigest:string;now?:number}):Readonly<LifecycleCertificate>;
export function terminalCandidate(input:TerminalInput):TerminalCandidate;
/** Server-internal snapshot binding; cannot be cloned/serialized. */
export function validateTerminalTransition(input:TerminalInput):NativeTerminalTransition;
export function lifecycleCertificateGuardPrelude(options:{marketPrefix:string;sourceDigest:string;recipeDigest:string;checkpointRawExpression:string;checkpointKeyIndex:number}):string;
/** Computes existing locals only. Native caller must splice before ALL writes. */
export function terminalBudgetPrelude(options:{transition:NativeTerminalTransition;budgetVariable?:string;accountingVariable?:string;oldRawExpression?:string;nextRawExpression?:string;stageRawExpression?:string;checkpointRawExpression:string;checkpointKeyIndex:number;configExpression:string}):string;
