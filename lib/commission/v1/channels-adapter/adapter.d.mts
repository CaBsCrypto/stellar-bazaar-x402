import type {SplitPolicy,SplitReceipt} from '../policy-router/fee-split-policy-v1.mjs';
export const PROFILE:'bazaar-split-exact-v1';
export const CHANNELS_TESTNET:'https://channels.openzeppelin.com/testnet';
export const USDC:string;
export const TREASURY:string;
export interface ValidationContext {nowSeconds:number;currentLedger:number;router:string;routerCodeHash:string}
export interface SignedRouterPacket {func:string;auth:[string]}
export interface ChannelsAcknowledgement {transactionId:string;hash:string;status?:string}
export interface LedgerEvidence {
  network:'stellar:testnet';status:'SUCCESS';transactionHash:string;ledger:number;
  envelopeXdr:string;resultXdr:string;resultMetaXdr:string;
}
export interface JournalRecord {
  version:typeof PROFILE;key:string;policyHash:string;packetHash:string;authorizationHash:string;
  state:'dispatch-claimed'|'uncertain'|'submitted-unconfirmed'|'confirmed';
  transactionId?:string;transactionHash?:string;receipt?:SplitReceipt;
}
/** Production implementation must be durable, linearizable and preserve claims across crash/expiry/rotation.
 * claim=false or lost acknowledgement can never permit dispatch. No reset, TTL or retry API is defined.
 * transition must compare expected state AND preserve original key/policyHash/packetHash/authorizationHash.
 */
export interface DurableJournal {
  claim(key:string,record:JournalRecord):Promise<boolean>;
  transition(key:string,expected:JournalRecord['state'],patch:Partial<Pick<JournalRecord,'state'|'transactionId'|'transactionHash'|'receipt'>>):Promise<boolean>;
}
/** A trusted server-only injected transport. Exactly one invocation, no redirects or automatic retries.
 * Must target CHANNELS_TESTNET, use existing approved credentials privately, cap body/time/response,
 * preserve uncertain dispatch semantics, and record native operational budget costs.
 */
export interface ChannelsTransport {submitSorobanTransaction(packet:SignedRouterPacket):Promise<ChannelsAcknowledgement>}
export interface LedgerReader {transaction(hash:string):Promise<LedgerEvidence>}
export function digest(value:unknown):string;
export function validatePolicy(policy:SplitPolicy,context:ValidationContext):true;
export function expectedFunc(policy:SplitPolicy):string;
export function validateAuthorization(policy:SplitPolicy,packet:SignedRouterPacket,context:ValidationContext):{packetHash:string;policyHash:string;authorizationHash:string;nonce:string};
export function reconcileLedger(policy:SplitPolicy,packet:SignedRouterPacket,transactionHash:string,evidence:LedgerEvidence,limits:{maximumFeeStroops:string;feeBump?:{source:string;sponsor:string}}):SplitReceipt;
export function createSplitAdapter(options?:{
  enabled?:boolean;journal?:DurableJournal;transport?:ChannelsTransport;rpc?:LedgerReader;
  context?:()=>ValidationContext|Promise<ValidationContext>;maximumFeeStroops?:string;feeBump?:{source:string;sponsor:string};
}):{submit(request:{policy:SplitPolicy;packet:SignedRouterPacket}):Promise<
  {state:'confirmed';receipt:SplitReceipt}|{state:'uncertain';key:string}|{state:'submitted-unconfirmed';key:string;transactionHash:string}
>};
