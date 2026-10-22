// A second implementation: no imports from server policy, adapter, history or discovery.
// It inspects normalized proofs, not raw ledger XDR. It cannot attest ledger authenticity.
import { createHash } from 'node:crypto';
const PROFILE = 'bazaar-split-exact-v1';
const ASSET = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const TREASURY = 'GATWLYZ5KF4H4YEPBINI6DARECUCI5CIN5ZEOF7YN7XYJ22Z5TLRXZ2X';
const HASH = /^[a-f0-9]{64}$/;
const requireValue = (ok, code) => { if (!ok) throw Error(code); };
const digest = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function positive(value) {
  requireValue(typeof value === 'string' && /^[1-9][0-9]{0,38}$/.test(value), 'CLIENT_INVALID_AMOUNT');
  return BigInt(value);
}

export function inspectCandidateManifest(manifest) {
  requireValue(manifest?.version === 'bazaar.payment-discovery/v1' && manifest.profile === PROFILE &&
    manifest.network === 'stellar:testnet' && manifest.asset === ASSET && manifest.decimals === 7, 'CLIENT_PROFILE_MISMATCH');
  requireValue(manifest.enabled === false && manifest.published === false && manifest.status === 'local-candidate' &&
    manifest.standardExactCompatible === false && manifest.capabilities.order === false &&
    manifest.capabilities.sign === false && manifest.capabilities.settle === false, 'CLIENT_UNSAFE_CANDIDATE');
  requireValue(manifest.fee?.bps === 150 && manifest.fee.includedInGross === true &&
    manifest.fee.treasury === TREASURY && manifest.fee.rounding === 'reject', 'CLIENT_FEE_MISMATCH');
  const gross = positive(manifest.allocation.grossAtomic), net = positive(manifest.allocation.sellerNetAtomic), fee = positive(manifest.allocation.commissionAtomic);
  requireValue(gross === 100000n && gross === net + fee && gross * 150n === fee * 10000n, 'CLIENT_ALLOCATION_MISMATCH');
  return { profile: PROFILE, paymentAllowed: false, reason: 'candidate-not-published-or-enabled' };
}

export function inspectNormalizedReceipt(policy, receipt) {
  requireValue(policy?.version === 'bazaar.fee-split-policy/v1' && policy.profile === PROFILE &&
    policy.network === 'stellar:testnet' && policy.asset === ASSET && policy.treasury === TREASURY && policy.feeBps === 150,
  'CLIENT_POLICY_MISMATCH');
  const gross = positive(policy.grossAtomic), net = positive(policy.sellerNetAtomic), fee = positive(policy.feeAtomic);
  requireValue(gross === net + fee && gross * 150n === fee * 10000n &&
    new Set([policy.payer, policy.provider, policy.treasury]).size === 3, 'CLIENT_ALLOCATION_MISMATCH');
  requireValue([policy.payer, policy.provider, policy.treasury].every(value => typeof value === 'string' && /^G[A-Z2-7]{55}$/.test(value)) &&
    typeof policy.router === 'string' && /^C[A-Z2-7]{55}$/.test(policy.router) && policy.router !== ASSET &&
    Number.isSafeInteger(policy.expiresAt) && policy.expiresAt > 0, 'CLIENT_ADDRESS_OR_EXPIRY');
  requireValue(HASH.test(policy.orderIdHash) && policy.orderIdHash === digest(policy.operationId) &&
    HASH.test(policy.networkIdHash) && policy.networkIdHash === digest('Test SDF Network ; September 2015') &&
    [policy.serviceCardHash, policy.inputHash, policy.routerCodeHash].every(value => HASH.test(value)), 'CLIENT_POLICY_BINDING');
  requireValue(receipt?.version === 'bazaar.fee-split-receipt/v1' && receipt.profile === PROFILE &&
    receipt.status === 'SUCCESS' && receipt.atomic === true && receipt.routerRetainedFunds === false &&
    receipt.verifiedLedgerMeta === true && HASH.test(receipt.transactionHash) && Number.isSafeInteger(receipt.ledger) && receipt.ledger > 0 &&
    receipt.routerCodeHash === policy.routerCodeHash && receipt.policyHash === digest(canonical(policy)), 'CLIENT_RECEIPT_BINDING');
  const expectedIntent = { asset: policy.asset, payer: policy.payer, provider: policy.provider, treasury: policy.treasury,
    router: policy.router, gross: policy.grossAtomic, fee_bps: policy.feeBps, network_id: policy.networkIdHash,
    order_id: policy.orderIdHash, card_hash: policy.serviceCardHash, input_hash: policy.inputHash, expires_at: policy.expiresAt };
  requireValue(canonical(receipt.intent) === canonical(expectedIntent), 'CLIENT_INTENT_BINDING');
  requireValue(Array.isArray(receipt.transfers) && receipt.transfers.length === 2, 'CLIENT_TRANSFER_COUNT');
  const expected = new Map([[policy.provider, policy.sellerNetAtomic], [policy.treasury, policy.feeAtomic]]);
  for (const transfer of receipt.transfers) {
    requireValue(transfer.from === policy.payer && transfer.asset === ASSET && expected.has(transfer.to) &&
      transfer.amountAtomic === expected.get(transfer.to), 'CLIENT_TRANSFER_MISMATCH');
    expected.delete(transfer.to);
  }
  requireValue(expected.size === 0, 'CLIENT_MISSING_ALLOCATION');
  return { profile: PROFILE, normalizedReceiptConsistent: true, ledgerAuthenticityVerifiedByClient: false,
    operationId: policy.operationId, grossAtomic: policy.grossAtomic, sellerNetAtomic: policy.sellerNetAtomic,
    commissionAtomic: policy.feeAtomic, transactionHash: receipt.transactionHash };
}
