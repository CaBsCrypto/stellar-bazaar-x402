export const PROFILE: 'bazaar-split-exact-v1';
export const POLICY_VERSION: 'bazaar.fee-split-policy/v1';
export const RECEIPT_VERSION: 'bazaar.fee-split-receipt/v1';
export const FEE_BPS: 150;
export const TREASURY: string;
export const ASSET: string;
export const NETWORK: 'stellar:testnet';
export const NETWORK_PASSPHRASE: string;
export const NETWORK_ID_HASH: string;
export const MAX_LIFETIME_SECONDS: 300;
export interface SplitPolicy {
  version: typeof POLICY_VERSION; profile: typeof PROFILE; network: typeof NETWORK;
  networkIdHash: string; asset: string; payer: string; provider: string; treasury: string;
  router: string; routerCodeHash: string; operationId: string; orderIdHash: string;
  serviceCardHash: string; inputHash: string; grossAtomic: string;
  sellerNetAtomic: string; feeAtomic: string; feeBps: 150; expiresAt: number;
}
export interface RouterIntent {
  asset: string; payer: string; provider: string; treasury: string; router: string;
  gross: string; fee_bps: number; network_id: string; order_id: string;
  card_hash: string; input_hash: string; expires_at: number;
}
export interface SplitReceipt {
  version: typeof RECEIPT_VERSION; profile: typeof PROFILE; policyHash: string;
  status: 'SUCCESS'; atomic: true; routerRetainedFunds: false; verifiedLedgerMeta: true;
  transactionHash: string; ledger: number; routerCodeHash: string; intent: RouterIntent;
  transfers: {from:string;to:string;asset:string;amountAtomic:string}[];
}
export function sha256(value: string | Uint8Array): string;
export function canonicalJson(value: unknown): string;
export function isPublicAddress(value: unknown, kind: 'account' | 'contract'): boolean;
export function calculateSplit(grossAtomic: string): {grossAtomic:string;sellerNetAtomic:string;feeAtomic:string};
export function validatePolicy(policy: unknown, context?: {nowSeconds?:number}): string[];
export function assertPolicy(policy: SplitPolicy, context?: {nowSeconds?:number}): SplitPolicy;
export function hashPolicy(policy: SplitPolicy): string;
export function toRouterIntent(policy: SplitPolicy, context?: {nowSeconds?:number}): RouterIntent;
export function reconcileReceipt(policy: SplitPolicy, receipt: unknown): string[];
