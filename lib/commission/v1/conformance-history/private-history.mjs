import { createHmac, timingSafeEqual } from 'node:crypto';
import { PROFILE, ASSET, TREASURY, NAMESPACE } from './discovery.mjs';

const ID = /^[a-zA-Z0-9_-]{1,96}$/;
const HASH = /^[a-f0-9]{64}$/;
const PHASES = new Set(['awaiting-payment', 'payment-submitting', 'payment-uncertain', 'paid', 'executing', 'execution-uncertain', 'delivered', 'delivery-failed']);
const PAID = new Set(['paid', 'executing', 'execution-uncertain', 'delivered', 'delivery-failed']);
const integer = value => typeof value === 'string' && /^[1-9][0-9]{0,37}$/.test(value);
const requireValue = (test, code) => { if (!test) throw Error(code); };

export function orderKey(operationId) {
  requireValue(typeof operationId === 'string' && ID.test(operationId), 'INVALID_OPERATION_ID');
  return `${NAMESPACE}:${operationId}`;
}

// Authentication must occur in the native owner resolver, not in request parameters.
function authorize(context) {
  requireValue(context?.authenticated === true && ID.test(context.ownerId ?? '') &&
    Number.isSafeInteger(context.generation) && context.generation > 0 &&
    Array.isArray(context.scopes) && context.scopes.includes('history:read'), 'UNAUTHORIZED_HISTORY');
}

export function validateHistoryRecord(record) {
  requireValue(record?.version === 'bazaar.split-order/v1' && record.profile === PROFILE &&
    record.key === orderKey(record.operationId), 'INVALID_PROFILE_NAMESPACE');
  requireValue(record.network === 'stellar:testnet' && record.asset === ASSET && record.treasury === TREASURY,
    'INVALID_HISTORY_ASSET_OR_TREASURY');
  const owners = [record.buyerOwnerId, record.sellerOwnerId, record.treasuryOwnerId];
  requireValue(owners.every(value => typeof value === 'string' && ID.test(value)) && new Set(owners).size === 3,
    'INVALID_DISTINCT_OWNERS');
  requireValue(PHASES.has(record.phase) && Number.isSafeInteger(record.createdAt) && record.createdAt >= 0,
    'INVALID_HISTORY_PHASE');
  requireValue([record.grossAtomic, record.sellerNetAtomic, record.feeAtomic].every(integer) && record.feeBps === 150,
    'INVALID_HISTORY_AMOUNT');
  const gross = BigInt(record.grossAtomic), fee = BigInt(record.feeAtomic), net = BigInt(record.sellerNetAtomic);
  requireValue(gross * 150n === fee * 10000n && gross === net + fee, 'INVALID_HISTORY_ALLOCATION');
  if (PAID.has(record.phase)) requireValue(record.paymentProof?.status === 'confirmed' &&
    HASH.test(record.paymentProof.transactionHash ?? '') && Number.isSafeInteger(record.paymentProof.ledger) &&
    record.paymentProof.ledger > 0 && record.paymentProof.atomicAllocationsVerified === true,
  'MISSING_VERIFIED_ALLOCATION_PROOF');
  if (record.phase === 'delivered') requireValue(HASH.test(record.delivery?.sha256 ?? ''), 'MISSING_DELIVERY_PROOF');
  if (record.delivery !== undefined) requireValue(HASH.test(record.delivery?.sha256 ?? ''), 'INVALID_DELIVERY_PROOF');
  return record;
}

export function projectPrivateRecord(context, source) {
  authorize(context);
  const role = source?.buyerOwnerId === context.ownerId ? 'buyer' :
    source?.sellerOwnerId === context.ownerId ? 'seller' : source?.treasuryOwnerId === context.ownerId ? 'treasury' : null;
  if (!role) return null;
  const record = validateHistoryRecord(source);
  // Whitelist projection: never expose input, output, credentials, counterpart owner IDs or raw auth.
  return {
    operationId: record.operationId, profile: PROFILE, role, network: record.network, asset: record.asset,
    phase: record.phase, createdAt: record.createdAt,
    amounts: { grossAtomic: record.grossAtomic, sellerNetAtomic: record.sellerNetAtomic,
      commissionAtomic: record.feeAtomic, feeBps: 150, ownDebitAtomic: role === 'buyer' ? record.grossAtomic : '0',
      ownCreditAtomic: role === 'seller' ? record.sellerNetAtomic : role === 'treasury' ? record.feeAtomic : '0' },
    payment: PAID.has(record.phase) ? { status: 'confirmed', transactionHash: record.paymentProof.transactionHash,
      ledger: record.paymentProof.ledger } : { status: record.phase === 'payment-uncertain' ? 'uncertain' : 'not-confirmed' },
    delivery: role !== 'treasury' && record.delivery ? { sha256: record.delivery.sha256, delivered: record.phase === 'delivered' } : null,
  };
}

export function createPrivateHistoryReader({ storage, cursorKey, now = Date.now, cursorTtlMs = 300000 }) {
  requireValue(storage && typeof storage.readOwnerPage === 'function', 'INVALID_READ_ONLY_STORAGE');
  requireValue(Buffer.isBuffer(cursorKey) && cursorKey.length >= 32, 'INVALID_CURSOR_KEY');
  requireValue(Number.isSafeInteger(cursorTtlMs) && cursorTtlMs > 0 && cursorTtlMs <= 300000, 'INVALID_CURSOR_TTL');
  const mac = payload => createHmac('sha256', cursorKey).update(payload).digest();
  function encode(context, nextKey) {
    const payload = Buffer.from(JSON.stringify({ owner: context.ownerId, generation: context.generation,
      namespace: NAMESPACE, key: nextKey, expires: now() + cursorTtlMs })).toString('base64url');
    return `${payload}.${mac(payload).toString('base64url')}`;
  }
  function decode(context, token) {
    requireValue(typeof token === 'string' && token.length <= 2048, 'INVALID_CURSOR');
    const [payload, signature, extra] = token.split('.');
    const actual = Buffer.from(signature ?? '', 'base64url'), expected = mac(payload ?? '');
    requireValue(!extra && actual.length === expected.length && timingSafeEqual(actual, expected), 'INVALID_CURSOR');
    let value;
    try { value = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw Error('INVALID_CURSOR'); }
    requireValue(value.owner === context.ownerId && value.generation === context.generation && value.namespace === NAMESPACE &&
      Number.isSafeInteger(value.expires) && value.expires > now() && typeof value.key === 'string' &&
      value.key.length <= 512 && value.key.length > 0, 'INVALID_CURSOR');
    return value.key;
  }
  return async function readHistory(context, { limit = 10, cursor } = {}) {
    authorize(context);
    requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 20, 'INVALID_HISTORY_LIMIT');
    const after = cursor === undefined ? undefined : decode(context, cursor);
    const result = await storage.readOwnerPage({ namespace: NAMESPACE, ownerId: context.ownerId, limit, after });
    requireValue(result && Array.isArray(result.records) && result.records.length <= limit &&
      typeof result.complete === 'boolean' && (result.nextKey === null ||
        (typeof result.nextKey === 'string' && result.nextKey.length > 0 && result.nextKey.length <= 512)), 'INVALID_STORAGE_PAGE');
    // Inconsistent owner indexes must not silently look like an empty successful history.
    const records = result.records.map(record => projectPrivateRecord(context, record));
    requireValue(records.every(Boolean), 'STORAGE_OWNER_INDEX_MISMATCH');
    return { version: 'bazaar.private-split-history/v1', profile: PROFILE, records,
      sourceCoverage: 'split-v1-only', legacyHistoryIncluded: false,
      partialResults: !result.complete || result.nextKey !== null,
      nextCursor: result.nextKey === null ? null : encode(context, result.nextKey),
      storageComplete: result.complete, total: null };
  };
}
