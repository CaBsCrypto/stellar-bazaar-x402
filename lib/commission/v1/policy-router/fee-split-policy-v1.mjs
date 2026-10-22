import { createHash } from 'node:crypto';

// This is a Bazaar-specific candidate profile, not Stellar x402 `exact`.
export const PROFILE = 'bazaar-split-exact-v1';
export const POLICY_VERSION = 'bazaar.fee-split-policy/v1';
export const RECEIPT_VERSION = 'bazaar.fee-split-receipt/v1';
export const FEE_BPS = 150;
export const TREASURY = 'GATWLYZ5KF4H4YEPBINI6DARECUCI5CIN5ZEOF7YN7XYJ22Z5TLRXZ2X';
export const ASSET = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const NETWORK = 'stellar:testnet';
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const MAX_LIFETIME_SECONDS = 300;
const HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const I128_MAX = (1n << 127n) - 1n;
const KEYS = ['version','profile','network','networkIdHash','asset','payer','provider','treasury','router','routerCodeHash','operationId','orderIdHash','serviceCardHash','inputHash','grossAtomic','sellerNetAtomic','feeAtomic','feeBps','expiresAt'].sort();

export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
export const NETWORK_ID_HASH = sha256(NETWORK_PASSPHRASE);
export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  throw new Error('NON_CANONICAL_POLICY_VALUE');
}

// Strict public StrKey decoder: version + 32 payload bytes + CRC16-XModem.
// No seed/key decoding is accepted; test vectors are cross-checked with Stellar SDK.
export function isPublicAddress(value, kind) {
  if (typeof value !== 'string' || !/^[A-Z2-7]{56}$/.test(value)) return false;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = []; let bits = 0; let acc = 0;
  for (const c of value) {
    acc = (acc << 5) | alphabet.indexOf(c); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((acc >>> bits) & 255); acc &= (1 << bits) - 1; }
  }
  if (bits !== 0 || bytes.length !== 35 || bytes[0] !== (kind === 'account' ? 48 : kind === 'contract' ? 16 : -1)) return false;
  let crc = 0;
  for (const byte of bytes.slice(0, 33)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 65535;
  }
  return bytes[33] === (crc & 255) && bytes[34] === (crc >>> 8);
}

function amount(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || value.length > 39) throw new Error('INVALID_ATOMIC_AMOUNT');
  const result = BigInt(value);
  if (result > I128_MAX) throw new Error('ATOMIC_AMOUNT_OVERFLOW');
  return result;
}

export function calculateSplit(grossAtomic) {
  const gross = amount(grossAtomic);
  // Match the contract's checked multiplication, rather than JS unlimited arithmetic.
  const numerator = gross * BigInt(FEE_BPS);
  if (numerator > I128_MAX) throw new Error('ATOMIC_AMOUNT_OVERFLOW');
  if (numerator % 10000n !== 0n) throw new Error('ROUNDING_NOT_PERMITTED');
  const fee = numerator / 10000n;
  const net = gross - fee;
  if (fee <= 0n || net <= 0n) throw new Error('INVALID_SPLIT');
  return { grossAtomic: gross.toString(), sellerNetAtomic: net.toString(), feeAtomic: fee.toString() };
}

/** Validation is deterministic unless nowSeconds is explicitly supplied. It never admits a payment. */
export function validatePolicy(policy, { nowSeconds } = {}) {
  const errors = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return ['policy-shape'];
  if (Object.keys(policy).sort().join('|') !== KEYS.join('|')) errors.push('policy-fields');
  if (policy.version !== POLICY_VERSION || policy.profile !== PROFILE) errors.push('profile-version');
  if (policy.network !== NETWORK || policy.networkIdHash !== NETWORK_ID_HASH) errors.push('network');
  if (policy.asset !== ASSET || !isPublicAddress(policy.asset, 'contract')) errors.push('asset');
  if (policy.treasury !== TREASURY) errors.push('treasury');
  if (![policy.payer, policy.provider, policy.treasury].every(v => isPublicAddress(v, 'account'))) errors.push('account');
  if (new Set([policy.payer, policy.provider, policy.treasury]).size !== 3) errors.push('distinct-accounts');
  if (!isPublicAddress(policy.router, 'contract') || policy.router === policy.asset) errors.push('router');
  if (!HEX.test(policy.routerCodeHash)) errors.push('router-code-hash');
  if (typeof policy.operationId !== 'string' || !UUID.test(policy.operationId)) errors.push('operation-id');
  if (!HEX.test(policy.orderIdHash) || policy.orderIdHash !== sha256(String(policy.operationId))) errors.push('order-binding');
  if (!HEX.test(policy.serviceCardHash) || !HEX.test(policy.inputHash) || [policy.orderIdHash, policy.serviceCardHash, policy.inputHash].some(v => v === '0'.repeat(64))) errors.push('content-binding');
  if (policy.feeBps !== FEE_BPS) errors.push('fee-bps');
  try {
    const split = calculateSplit(policy.grossAtomic);
    if (split.sellerNetAtomic !== policy.sellerNetAtomic || split.feeAtomic !== policy.feeAtomic) errors.push('allocation');
  } catch { errors.push('amount'); }
  if (!Number.isSafeInteger(policy.expiresAt) || policy.expiresAt <= 0) errors.push('expiry');
  if (nowSeconds !== undefined) {
    if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) errors.push('clock');
    else if (policy.expiresAt <= nowSeconds || policy.expiresAt > nowSeconds + MAX_LIFETIME_SECONDS) errors.push('expiry-window');
  }
  return errors;
}

export function assertPolicy(policy, context) {
  const errors = validatePolicy(policy, context);
  if (errors.length) throw new Error('INVALID_SPLIT_POLICY:' + errors.join(','));
  return policy;
}

export function hashPolicy(policy) { assertPolicy(policy); return sha256(canonicalJson(policy)); }

/** Values map one-to-one to the Soroban SplitIntent contracttype. Hex bytes remain bytes at the adapter boundary. */
export function toRouterIntent(policy, context) {
  assertPolicy(policy, context);
  return {
    asset: policy.asset, payer: policy.payer, provider: policy.provider, treasury: policy.treasury,
    router: policy.router, gross: policy.grossAtomic, fee_bps: policy.feeBps,
    network_id: policy.networkIdHash, order_id: policy.orderIdHash,
    card_hash: policy.serviceCardHash, input_hash: policy.inputHash, expires_at: policy.expiresAt,
  };
}

/** A normalized ledger proof is accepted only from the strict RPC/event adapter, not an HTTP settlement response. */
export function reconcileReceipt(policy, receipt) {
  assertPolicy(policy);
  if (!receipt || typeof receipt !== 'object') return ['receipt-shape'];
  const errors = [];
  if (receipt.version !== RECEIPT_VERSION || receipt.profile !== PROFILE) errors.push('receipt-version');
  if (receipt.policyHash !== hashPolicy(policy)) errors.push('policy-hash');
  if (receipt.status !== 'SUCCESS' || receipt.atomic !== true || receipt.routerRetainedFunds !== false) errors.push('settlement-status');
  if (!HEX.test(receipt.transactionHash) || !Number.isSafeInteger(receipt.ledger) || receipt.ledger <= 0) errors.push('transaction');
  if (receipt.routerCodeHash !== policy.routerCodeHash) errors.push('router-code-hash');
  try { if (canonicalJson(receipt.intent) !== canonicalJson(toRouterIntent(policy))) errors.push('intent-binding'); }
  catch { errors.push('intent-binding'); }
  const expected = [
    {from:policy.payer,to:policy.provider,asset:policy.asset,amountAtomic:policy.sellerNetAtomic},
    {from:policy.payer,to:policy.treasury,asset:policy.asset,amountAtomic:policy.feeAtomic},
  ];
  try { if (!Array.isArray(receipt.transfers) || canonicalJson(receipt.transfers) !== canonicalJson(expected)) errors.push('transfers'); }
  catch { errors.push('transfers'); }
  // Raw ledger meta verification is mandatory in the Channels adapter; this normalizer alone is not cryptographic proof.
  if (receipt.verifiedLedgerMeta !== true) errors.push('ledger-meta');
  return errors;
}
