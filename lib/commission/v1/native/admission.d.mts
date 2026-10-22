import type {SplitStageAccounting} from './stage-accounting.mjs';
export const SPLIT_WINDOW_MS:number;
export const SPLIT_COST_BOUND:Readonly<{version:string;transferBytes:number;recoveryCommands:number;backgroundCommands:number;safetyBytes:number;storageBytesPerOrder:number;ledgerReservedBytes:number;maximumOrders:number}>;
export const SPLIT_COST_DIGEST:string;
export function splitServiceCardHash(input:{serviceId:string;sourceServiceId:string;sourceCardHash:string;provider:string}):string;
export function splitLedgerKey(prefix:string):string;
export function parseSplitLedger(raw:unknown):{version:number;revision:string|null;sellers:Record<string,any>[];operations:Record<string,any>[]};
export function legacyAdmissionProjection(raw:unknown,buyerOwnerId:string,sellerOwnerId:string,now:number):Record<string,any>[];
export interface NativeSplitAdmission {authorize(input:any):Promise<any>;prepareWrite(input:any):Promise<any>;resolveService(serviceId:string):Promise<any>;reportSeller(principal:any,input:any):Promise<any>;inspectLifecycle(input:{principal:any;operationId:string}):Promise<{status:'legacy'|'retention'|'active';operationId?:string;phase?:string;closureDigest?:string|null;readOnly:true;mayExecute:false;completeFinancialBudgetCertified?:false}>;stageAccounting:Readonly<Pick<SplitStageAccounting,'claim'|'lookup'|'inspectTail'|'assertDispatchTail'|'financialReady'>>;ledgerKey:string;costBound:typeof SPLIT_COST_BOUND;costDigest:string;profile:string;}
export function createNativeSplitAdmission(options:Record<string,unknown>):NativeSplitAdmission;
