import type {DurableJournal} from './adapter.mjs';
export const SPLIT_JOURNAL_CAS:string;
export interface NativeJournalWriteInput {key:string;action:'claim'|'transition'}
export interface NativeJournalCasPlan {readonly script:string;readonly keys:readonly string[];readonly args:readonly string[]}
export interface NativeJournalGuard {keys:string[];values:(string|null)[];expiresAtMs:number;commit?:(base:NativeJournalCasPlan)=>Promise<{execute():Promise<unknown>}>|{execute():Promise<unknown>}}
export function createRedisSplitJournal(options?:{
 enabled?:boolean;namespace?:string;nativeStoragePrefix?:string;
 redis?:{get(key:string):Promise<string|null>;eval(script:string,keys:string[],args:string[]):Promise<unknown>};
 /** Must admit/reserve native storage, counters and recovery cost before returning a bounded CAS guard.
  * Guard keys are read only; the split journal never rewrites shared quota/budget/reservation state.
  * Use metered native Redis client configured retries0/autopipeliningfalse/deserializationfalse.
  */
 authorizeWrite?:(input:Readonly<NativeJournalWriteInput>)=>Promise<NativeJournalGuard>|NativeJournalGuard;
 readRecord?:(input:{key:string;action:'read'|'transition'})=>Promise<string|null>;
}):DurableJournal&{read(key:string):Promise<unknown|null>};
