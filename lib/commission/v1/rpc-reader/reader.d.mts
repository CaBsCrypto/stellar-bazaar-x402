export const TESTNET_RPC: 'https://soroban-testnet.stellar.org/';
export const PROFILE: 'bazaar-split-exact-v1';
export const MAX_RESPONSE_BYTES: 524288;
export type RpcScope = 'rpc:transaction' | 'rpc:latest-ledger' | 'rpc:router-pin' | 'rpc:recovery';
export interface ReadAuthorization {
  version: 'bazaar.rpc-read-authorization/v1'; profile: typeof PROFILE;
  operationId: string; policyHash: string; packetHash: string; transactionHash: string | null;
  router: string; routerCodeHash: string; expiresAtMs: number; scopes: RpcScope[];
}
export interface LedgerEvidence {
  network: 'stellar:testnet'; status: 'SUCCESS'; transactionHash: string; ledger: number;
  envelopeXdr: string; resultXdr: string; resultMetaXdr: string;
}
export interface UnresolvedTransaction {
  network: 'stellar:testnet'; status: 'NOT_FOUND' | 'FAILED'; transactionHash: string; latestLedger: number;
  outcome: 'unresolved-or-outside-retention' | 'failed'; pending: boolean; canResubmit: false; readOnly: true;
}
export interface ReadBinding {
  operationId: string; policyHash: string; packetHash: string; transactionHash: string;
}
export interface NativeReadAdmission {
  endpoint: typeof TESTNET_RPC; method: 'POST'; rpcMethod: 'getTransaction' | 'getLatestLedger' | 'getLedgerEntries';
  maximumAttempts: 1; outboundBytes: number; maximumInboundBytes: typeof MAX_RESPONSE_BYTES; timeoutMs: number;
  binding: { operationId: string; policyHash: string; packetHash: string; transactionHash: string | null };
}
export interface RpcReader {
  transaction(hash: string): Promise<LedgerEvidence | UnresolvedTransaction>;
  getLatestLedger(): Promise<{network:'stellar:testnet'; id:string; sequence:number; protocolVersion:number}>;
  pinRouter(): Promise<{network:'stellar:testnet'; router:string; routerCodeHash:string; codeBytes:number; ledger:number;
    instanceAndCodeRead:true; wasmBytesHashVerified:true; trustedRpcEndpoint:typeof TESTNET_RPC; consensusProofVerified:false}>;
  recoverSameAttempt(binding: ReadBinding): Promise<LedgerEvidence | UnresolvedTransaction>;
}
export interface AdapterLedgerReader {transaction(hash: string): Promise<LedgerEvidence>}
export function routerLedgerKeys(router: string, routerCodeHash: string): [string, string];
export function createTestnetRpcReader(options?: {
  enabled?: boolean; fetcher?: typeof fetch; admit?: (request: NativeReadAdmission) => boolean | Promise<boolean>;
  scope?: ReadAuthorization; now?: () => number; timeoutMs?: number;
}): RpcReader;
export function asAdapterLedgerReader(reader: RpcReader): AdapterLedgerReader;

export function decodePinnedRouterEntries(result: unknown, pins: {router:string;routerCodeHash:string}): Awaited<ReturnType<RpcReader['pinRouter']>>;
